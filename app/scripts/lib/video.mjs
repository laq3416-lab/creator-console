/**
 * 视频结构分析：用 ffmpeg 的场景检测把「节奏/动效」变成数字。
 *
 * 不依赖任何视觉大模型——镜头切换本身就是可测量的信号：
 *   · cuts_per_sec 高   → 剪辑碎、画面变化快、动效多
 *   · cuts_per_sec 低   → 一个镜头怼到底，静态口播感
 *   · first3s_cuts      → 开头 3 秒切了几刀，这是钩子节奏的直接体现
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const exec = promisify(execFile);
const FFMPEG = process.env.FFMPEG_PATH || 'ffmpeg';

export async function hasFfmpeg() {
  try {
    await exec(FFMPEG, ['-version']);
    return true;
  } catch {
    return false;
  }
}

/** 下载到临时文件，返回路径。签名地址会过期，必须拿到就下。 */
export async function download(url, name) {
  const dir = path.join(os.tmpdir(), 'creator-console-video');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}.mp4`);
  if (fs.existsSync(file) && fs.statSync(file).size > 10000) return file;

  const res = await fetch(url, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
      Referer: 'https://www.douyin.com/',
    },
  });
  if (!res.ok) throw new Error(`下载失败 ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 10000) throw new Error('文件太小，可能是错误页');
  fs.writeFileSync(file, buf);
  return file;
}

export function cleanup(file) {
  try {
    fs.unlinkSync(file);
  } catch {}
}

/**
 * 场景检测。阈值 0.3 是比较通用的「切镜头」判定，
 * 太低会把运镜抖动算成切换，太高会漏掉淡入淡出的转场。
 */
export async function analyze(file) {
  const { stdout: probe } = await exec('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    file,
  ]);
  const duration = Number(probe.trim());
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('读不出时长');

  let log = '';
  try {
    const r = await exec(
      FFMPEG,
      ['-hide_banner', '-i', file, '-filter:v', "select='gt(scene,0.3)',showinfo", '-f', 'null', '-'],
      { maxBuffer: 64 * 1024 * 1024 },
    );
    log = r.stderr;
  } catch (e) {
    log = e.stderr ?? '';
  }

  const times = [...log.matchAll(/pts_time:([\d.]+)/g)]
    .map((m) => Number(m[1]))
    .filter((t) => Number.isFinite(t) && t < duration);

  const cuts = times.length;
  return {
    durationSec: +duration.toFixed(2),
    cuts,
    cutsPerSec: +(cuts / duration).toFixed(3),
    avgShotSec: +(duration / (cuts + 1)).toFixed(2),
    first3sCuts: times.filter((t) => t <= 3).length,
  };
}

/** 下载 + 分析 + 删除，一步到位 */
export async function analyzeUrl(url, name) {
  const file = await download(url, name);
  try {
    return await analyze(file);
  } finally {
    cleanup(file);
  }
}
