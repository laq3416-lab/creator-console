/**
 * 常驻监控
 *
 * 不是「跑一次给你一份报告」，而是按节奏一直转：
 *   · 每 30 分钟   采自己的数据 → 跑规则
 *   · 每 6 小时    扫一遍同赛道爆款 → 新爆款立刻出建议
 *   · 每 24 小时   让模型做一次复盘
 *
 * 每个任务都是独立子进程：一个挂了不影响其他的，错误记进 job_run。
 * 定时任务用屏幕外窗口，不会每半小时弹一个窗口打扰你。
 *
 * 用法：npm run watch
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './lib/ingest.mjs';
import { WATCHER_FILE, hasLogin } from './lib/paths.mjs';

const MIN = 60_000;
const HOUR = 60 * MIN;

const TASKS = [
  {
    key: 'collect',
    platform: 'douyin',
    label: '采集自己的数据',
    script: 'scripts/collect-douyin.mjs',
    every: Number(process.env.WATCH_COLLECT_MIN ?? 30) * MIN,
    needsBrowser: true,
  },
  {
    key: 'collect:xhs',
    label: '采集小红书',
    script: 'scripts/collect-xhs.mjs',
    every: Number(process.env.WATCH_COLLECT_MIN ?? 30) * MIN,
    needsBrowser: true,
    platform: 'xhs',
  },
  {
    key: 'collect:xianyu',
    label: '采集闲鱼',
    script: 'scripts/collect-xianyu.mjs',
    every: 60 * MIN,
    needsBrowser: true,
    platform: 'xianyu',
  },
  {
    // 小红书能无头，高频也不打扰
    key: 'inbox:xhs',
    label: '小红书私信',
    script: 'scripts/collect-inbox.mjs',
    args: ['xhs'],
    every: Number(process.env.WATCH_INBOX_MIN ?? 5) * MIN,
    needsBrowser: true,
    platform: 'xhs',
  },
  {
    // 闲鱼无头会被拦，只能开真窗口，所以降频
    key: 'inbox:xianyu',
    label: '闲鱼私信',
    script: 'scripts/collect-inbox.mjs',
    args: ['xianyu'],
    every: Number(process.env.WATCH_INBOX_SLOW_MIN ?? 20) * MIN,
    needsBrowser: true,
    platform: 'xianyu',
  },
  {
    // 抖音同理，且要读 DOM，频次要低
    key: 'inbox:douyin',
    label: '抖音私信',
    script: 'scripts/collect-inbox.mjs',
    args: ['douyin'],
    every: Number(process.env.WATCH_INBOX_SLOW_MIN ?? 20) * MIN,
    needsBrowser: true,
    platform: 'douyin',
  },
  {
    key: 'health',
    label: '自检',
    script: 'scripts/check-health.mjs',
    every: 30 * MIN,
    needsBrowser: false,
  },
  {
    key: 'rules',
    label: '跑规则',
    script: 'scripts/run-rules.mjs',
    every: Number(process.env.WATCH_COLLECT_MIN ?? 30) * MIN,
    needsBrowser: false,
  },
  {
    key: 'radar',
    platform: 'douyin',
    label: '扫同赛道爆款',
    script: 'scripts/collect-radar.mjs',
    every: Number(process.env.WATCH_RADAR_HOURS ?? 6) * HOUR,
    needsBrowser: true,
  },
  {
    key: 'video',
    label: '分析视频节奏',
    script: 'scripts/analyze-video.mjs',
    every: 24 * HOUR,
    needsBrowser: false,
  },
  {
    key: 'prune',
    label: '清理旧数据',
    script: 'scripts/prune.mjs',
    every: 24 * HOUR,
    needsBrowser: false,
    enabled: process.env.WATCH_PRUNE === '1',
  },
  {
    key: 'analyze',
    label: '模型复盘',
    script: 'scripts/analyze.mjs',
    every: Number(process.env.WATCH_ANALYZE_HOURS ?? 24) * HOUR,
    needsBrowser: false,
  },
];

const BEAT = WATCHER_FILE;
const db = openDb();

const ensureTable = () => db.exec(fs.readFileSync(path.join(process.cwd(), 'src/db/schema.sql'), 'utf8'));
ensureTable();

function lastRun(task) {
  return db
    .prepare(
      `SELECT * FROM job_run WHERE task = ? AND status IN ('ok','failed') ORDER BY finished_at DESC LIMIT 1`,
    )
    .get(task);
}

const DEFAULT_INTERVALS = { douyin: 0, xhs: 360, xianyu: 0 };
function platformInterval(platform) {
  const row = db.prepare('SELECT interval_minutes FROM sync_setting WHERE platform = ?').get(platform);
  return row ? row.interval_minutes : DEFAULT_INTERVALS[platform];
}

function isDue(task) {
  const interval = task.platform ? platformInterval(task.platform) : null;
  if (interval === 0) return false;
  const last = lastRun(task.key);
  if (!last?.finished_at) return true;
  // 失败的任务 10 分钟后重试，不要按整天等
  if (last.status === 'failed' && !task.platform) return Date.now() - last.finished_at > 10 * MIN;
  return Date.now() - last.finished_at >= (interval != null ? interval * MIN : task.every);
}

let currentState = 'idle';
function beat(state) {
  currentState = state;
  fs.mkdirSync(path.dirname(BEAT), { recursive: true });
  fs.writeFileSync(
    BEAT,
    JSON.stringify({ pid: process.pid, state, lastBeat: Date.now(), tasks: TASKS.map((t) => t.key) }),
  );
}

function runTask(task) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const ins = db
      .prepare(`INSERT INTO job_run (task, status, started_at) VALUES (?, 'running', ?)`)
      .run(task.key, startedAt);
    const id = ins.lastInsertRowid;
    const t0 = Date.now();

    const child = spawn(process.execPath, [task.script, ...(task.args ?? [])], {
      cwd: process.cwd(),
      env: { ...process.env, SCREEN_OFF: task.needsBrowser ? '1' : '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    child.stdout.on('data', (d) => {
      out += d.toString();
      if (out.length > 20000) out = out.slice(-20000);
    });
    child.stderr.on('data', (d) => {
      out += d.toString();
      if (out.length > 20000) out = out.slice(-20000);
    });

    child.on('close', (code) => {
      const status = code === 0 ? 'ok' : 'failed';
      const secs = ((Date.now() - t0) / 1000).toFixed(0);
      const tail = out.trim().split('\n').slice(-3).join(' | ').slice(0, 400);
      db.prepare(`UPDATE job_run SET status = ?, detail = ?, finished_at = ? WHERE id = ?`).run(
        status,
        tail,
        Date.now(),
        id,
      );
      console.log(`  ${status === 'ok' ? '✓' : '✗'} ${task.label} ${secs}s`);
      if (status === 'failed') console.log(`    ${tail}`);
      resolve(status);
    });
  });
}

/* 启动时先跑一轮，然后进入循环 */
console.log('监控启动');
console.log(
  TASKS.map((t) => `  ${t.label}：每 ${Math.round(t.every / MIN)} 分钟`).join('\n'),
);
console.log('');

let running = false;
async function tick() {
  if (running) return;
  running = true;
  try {
    for (const task of TASKS) {
      const requested = db.prepare('SELECT requested_at FROM sync_request WHERE task = ?').get(task.key);
      if (!requested && (task.enabled === false || !isDue(task))) continue;
      if (task.needsBrowser && !(await hasLogin(task.platform))) {
        if (requested) {
          const now = Date.now();
          db.prepare("INSERT INTO job_run (task, status, started_at, finished_at, detail) VALUES (?, 'failed', ?, ?, ?)").run(task.key, now, now, '未检测到登录，请先登录对应平台');
          db.prepare('DELETE FROM sync_request WHERE task = ? AND requested_at = ?').run(task.key, requested.requested_at);
        }
        continue;
      }
      beat('running:' + task.key);
      console.log(`▶ ${task.label}`);
      await runTask(task);
      if (requested) db.prepare('DELETE FROM sync_request WHERE task = ? AND requested_at = ?').run(task.key, requested.requested_at);
      beat('idle');
    }
  } catch (e) {
    console.error('调度异常:', e.message);
  } finally {
    running = false;
    beat('idle');
  }
}

beat('idle');
setInterval(() => beat(currentState), 60_000);
await tick();
setInterval(tick, 60_000);

process.on('SIGINT', () => {
  console.log('\n监控停止');
  process.exit(0);
});
