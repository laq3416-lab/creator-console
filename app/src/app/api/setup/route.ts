import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DATA_ROOT } from '@/lib/paths';
import { getLastSyncedAt } from '@/db/queries';
import { hasLogin } from '@/lib/douyin-login';
import { PLATFORMS, PLATFORM_META, DATA_ROOT as DR } from '@/lib/paths';

export const dynamic = 'force-dynamic';

function hasFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function GET() {
  const envFile = path.join(process.cwd(), '.env.local');
  const keySaved = fs.existsSync(envFile) && /DEEPSEEK_API_KEY=\S+/.test(fs.readFileSync(envFile, 'utf8'));
  const last = getLastSyncedAt();

  return NextResponse.json({
    steps: [
      {
        key: 'apikey',
        label: '填入 DeepSeek API Key',
        done: Boolean(process.env.DEEPSEEK_API_KEY) || keySaved,
        hint: '模型复盘和选题要用。没有它其余功能照常，只是不出 AI 建议。',
      },
      {
        key: 'login',
        label: '登录你的账号（至少一个平台）',
        done: PLATFORMS.some((p) => hasLogin(p)),
        hint: '点平台按钮会弹出浏览器窗口扫码。每个平台独立登录态，只存在你本机。',
        platforms: PLATFORMS.map((p) => ({
          key: p,
          name: PLATFORM_META[p].name,
          done: hasLogin(p),
        })),
      },
      {
        key: 'collect',
        label: '采集第一批数据',
        done: Boolean(last),
        hint: '采完总览页就有数据了。之后每 30 分钟自动更新。',
      },
      {
        key: 'ffmpeg',
        label: '视频分析（可选）',
        done: hasFfmpeg(),
        hint: hasFfmpeg() ? '已就绪，能算镜头节奏。' : '没装 ffmpeg，镜头节奏分析用不了。macOS：brew install ffmpeg',
      },
    ],
    node: process.version,
    dataDir: DATA_ROOT,
  });
}
