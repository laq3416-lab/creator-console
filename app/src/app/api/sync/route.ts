import { isLocalWrite } from '@/lib/local-request';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { hasLogin } from '@/lib/douyin-login';
import { ensureWatcher, watcherAlive } from '@/lib/watcher-boot';
import fs from 'node:fs';
import { WATCHER_FILE } from '@/lib/paths';

export const dynamic = 'force-dynamic';
const defaults: Record<string, number> = { douyin: 0, xhs: 360, xianyu: 0 };
const tasks: Record<string, string> = { douyin: 'collect', xhs: 'collect:xhs', xianyu: 'collect:xianyu' };
const allowed = [0, 60, 360, 1440];

export async function GET() {
  const rows = db.$client.prepare('SELECT platform, interval_minutes FROM sync_setting').all() as { platform: string; interval_minutes: number }[];
  const settings = { ...defaults };
  const frequencies: Record<string, number> = {};
  for (const row of rows) if (Object.hasOwn(defaults, row.platform) && allowed.includes(row.interval_minutes)) settings[row.platform] = row.interval_minutes;
  for (const [platform, collect] of Object.entries(tasks)) {
    for (const task of [collect, `inbox:${platform}`, ...(platform === 'douyin' ? ['radar'] : [])]) {
      frequencies[task] = rows.find((r) => r.platform === `task:${task}` && allowed.includes(r.interval_minutes))?.interval_minutes ?? settings[platform];
    }
  }
  const pending = db.$client.prepare('SELECT task, requested_at AS requestedAt FROM sync_request').all();
  const alive = watcherAlive();
  let currentTask: string | null = null;
  if (alive) try {
    const beat = JSON.parse(fs.readFileSync(WATCHER_FILE, 'utf8'));
    if (typeof beat.state === 'string' && beat.state.startsWith('running:')) currentTask = beat.state.slice(8);
  } catch { /* 状态不可读时按未知处理 */ }
  const latestQuery = db.$client.prepare('SELECT status, started_at AS startedAt, finished_at AS finishedAt, detail FROM job_run WHERE task = ? ORDER BY started_at DESC LIMIT 1');
  const successQuery = db.$client.prepare("SELECT finished_at AS finishedAt FROM job_run WHERE task = ? AND status = 'ok' ORDER BY finished_at DESC LIMIT 1");
  const status: Record<string, unknown> = {};
  for (const task of ['collect', 'collect:xhs', 'collect:xianyu', 'inbox:douyin', 'inbox:xhs', 'inbox:xianyu', 'radar']) {
    const latest = latestQuery.get(task) as { status: string; startedAt: number; finishedAt: number | null; detail: string | null } | undefined;
    const success = successQuery.get(task) as { finishedAt: number } | undefined;
    status[task] = { latest: latest ? { ...latest, status: latest.status === 'running' && currentTask !== task ? 'interrupted' : latest.status } : null, lastSuccessAt: success?.finishedAt ?? null, running: currentTask === task };
  }
  return NextResponse.json({ settings, frequencies, pending, watcherAlive: alive, status });
}

export async function POST(req: Request) {
  if (!isLocalWrite(req)) return NextResponse.json({ error: '请求来源不允许' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const platform = String(body.platform ?? '');
  if (!Object.hasOwn(defaults, platform)) return NextResponse.json({ error: '未知平台' }, { status: 400 });
  if (body.action === 'settings') {
    const minutes = Number(body.minutes);
    if (!allowed.includes(minutes)) return NextResponse.json({ error: '无效频率' }, { status: 400 });
    const task = body.kind === 'content' ? tasks[platform] : body.kind === 'inbox' ? `inbox:${platform}` : body.kind === 'radar' && platform === 'douyin' ? 'radar' : null;
    if (!task && body.kind != null) return NextResponse.json({ error: '无效同步类型' }, { status: 400 });
    db.$client.prepare('INSERT INTO sync_setting (platform, interval_minutes) VALUES (?, ?) ON CONFLICT(platform) DO UPDATE SET interval_minutes=excluded.interval_minutes').run(task ? `task:${task}` : platform, minutes);
    return NextResponse.json({ ok: true });
  }
  if (body.action === 'sync') {
    if (body.kind !== 'content' && body.kind !== 'inbox' && !(body.kind === 'radar' && platform === 'douyin')) return NextResponse.json({ error: '无效同步类型' }, { status: 400 });
    if (!hasLogin(platform as 'douyin' | 'xhs' | 'xianyu')) return NextResponse.json({ error: '未检测到登录，请先在账号页登录' }, { status: 400 });
    ensureWatcher();
    const task = body.kind === 'inbox' ? `inbox:${platform}` : body.kind === 'radar' ? 'radar' : tasks[platform];
    db.$client.prepare('INSERT OR IGNORE INTO sync_request (task, requested_at) VALUES (?, ?)').run(task, Date.now());
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: '无效操作' }, { status: 400 });
}
