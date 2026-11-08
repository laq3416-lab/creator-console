import { NextResponse } from 'next/server';
import { db } from '@/db';
import { hasLogin } from '@/lib/douyin-login';
import { ensureWatcher, watcherAlive } from '@/lib/watcher-boot';

export const dynamic = 'force-dynamic';
const defaults: Record<string, number> = { douyin: 0, xhs: 360, xianyu: 0 };
const tasks: Record<string, string> = { douyin: 'collect', xhs: 'collect:xhs', xianyu: 'collect:xianyu' };
const allowed = [0, 60, 360, 1440];

export async function GET() {
  const rows = db.$client.prepare('SELECT platform, interval_minutes FROM sync_setting').all() as { platform: string; interval_minutes: number }[];
  const settings = { ...defaults };
  for (const row of rows) if (row.platform in defaults && allowed.includes(row.interval_minutes)) settings[row.platform] = row.interval_minutes;
  const pending = db.$client.prepare('SELECT task FROM sync_request').all();
  return NextResponse.json({ settings, pending, watcherAlive: watcherAlive() });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const platform = String(body.platform ?? '');
  if (!Object.hasOwn(defaults, platform)) return NextResponse.json({ error: '未知平台' }, { status: 400 });
  if (body.action === 'settings') {
    const minutes = Number(body.minutes);
    if (!allowed.includes(minutes)) return NextResponse.json({ error: '无效频率' }, { status: 400 });
    db.$client.prepare('INSERT INTO sync_setting (platform, interval_minutes) VALUES (?, ?) ON CONFLICT(platform) DO UPDATE SET interval_minutes=excluded.interval_minutes').run(platform, minutes);
    return NextResponse.json({ ok: true });
  }
  if (body.action === 'sync') {
    if (body.kind !== 'content' && body.kind !== 'inbox') return NextResponse.json({ error: '无效同步类型' }, { status: 400 });
    if (!hasLogin(platform as 'douyin' | 'xhs' | 'xianyu')) return NextResponse.json({ error: '未检测到登录，请先在账号页登录' }, { status: 400 });
    ensureWatcher();
    const task = body.kind === 'inbox' ? `inbox:${platform}` : tasks[platform];
    db.$client.prepare('INSERT OR IGNORE INTO sync_request (task, requested_at) VALUES (?, ?)').run(task, Date.now());
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: '无效操作' }, { status: 400 });
}
