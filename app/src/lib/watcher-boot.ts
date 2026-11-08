/**
 * 让监控跟着应用一起起来，而不是靠人手动敲命令。
 *
 * 判断依据是心跳文件：还活着就不重复起，避免开两个监控抢浏览器 Profile。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { WATCHER_FILE } from './paths';
import { hasLogin } from './douyin-login';

const HEARTBEAT_FRESH_MS = 180_000;

export function watcherAlive(): boolean {
  try {
    if (!fs.existsSync(WATCHER_FILE)) return false;
    const b = JSON.parse(fs.readFileSync(WATCHER_FILE, 'utf8'));
    return Date.now() - b.lastBeat < HEARTBEAT_FRESH_MS;
  } catch {
    return false;
  }
}

export function ensureWatcher(): void {
  // 构建阶段不要起进程
  if (process.env.NEXT_PHASE === 'phase-production-build') return;
  if (process.env.CONSOLE_NO_WATCH === '1') return;
  if (watcherAlive()) return;
  // 还没登录就先不起：新用户第一次打开不该被弹浏览器
  if (!(['douyin', 'xhs', 'xianyu'] as const).some(hasLogin)) return;

  const script = path.join(process.cwd(), 'scripts', 'watch.mjs');
  if (!fs.existsSync(script)) return;

  try {
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore',
      env: { ...process.env },
    });
    child.unref();
    console.log('[watcher] 已随应用启动，pid', child.pid);
  } catch (e) {
    console.error('[watcher] 启动失败', e);
  }
}
