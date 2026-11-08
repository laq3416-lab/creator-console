import { isLocalWrite } from '@/lib/local-request';
import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import path from 'node:path';

export const dynamic = 'force-dynamic';

let loggingIn = false;

/** 触发扫码登录：会弹出一个真实浏览器窗口 */
export async function POST(req: Request) {
  if (!isLocalWrite(req)) return NextResponse.json({ error: '请求来源不允许' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const platform = String(body?.platform ?? 'douyin');
  if (loggingIn) return NextResponse.json({ started: false, reason: '窗口已经开着了' });
  loggingIn = true;

  const child = spawn(process.execPath, [path.join(process.cwd(), 'scripts', 'login.mjs'), platform], {
    cwd: process.cwd(),
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, LOGIN_TIMEOUT_MIN: '10' },
  });
  child.unref();
  child.on('exit', () => {
    loggingIn = false;
  });
  setTimeout(() => {
    loggingIn = false;
  }, 11 * 60_000);

  return NextResponse.json({ started: true });
}
