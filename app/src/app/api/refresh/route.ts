import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { getLastSyncedAt } from '@/db/queries';
import { watcherAlive } from '@/lib/watcher-boot';

export const dynamic = 'force-dynamic';

let running = false;

/** 状态：数据有多旧、监控活着没 */
export async function GET() {
  const last = getLastSyncedAt();
  return NextResponse.json({
    lastSyncedAt: last,
    ageMinutes: last ? Math.round((Date.now() - last) / 60000) : null,
    watcherAlive: watcherAlive(),
    refreshing: running,
  });
}

/** 手动点刷新：只跑采集 + 规则，很快；扫对标和复盘交给监控自己按节奏跑 */
export async function POST() {
  if (running) return NextResponse.json({ started: false, reason: '已经在跑了' });
  running = true;

  const script = path.join(process.cwd(), 'scripts', 'collect-douyin.mjs');
  const child = spawn(process.execPath, [script], {
    cwd: process.cwd(),
    env: { ...process.env, SCREEN_OFF: '1' },
    stdio: 'ignore',
    detached: true,
  });
  child.unref();

  child.on('error', () => { running = false; });
  child.on('exit', (code) => {
    if (code === 0) spawn(process.execPath, [path.join(process.cwd(), 'scripts', 'run-rules.mjs')], {
      cwd: process.cwd(),
      stdio: 'ignore',
    });
    running = false;
  });

  return NextResponse.json({ started: true });
}
