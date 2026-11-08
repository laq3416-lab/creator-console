import { isLocalWrite } from '@/lib/local-request';
import { NextResponse } from 'next/server';
import { db } from '@/db';
import { getLastSyncedAt } from '@/db/queries';
import { hasLogin } from '@/lib/douyin-login';
import { ensureWatcher, watcherAlive } from '@/lib/watcher-boot';

export const dynamic = 'force-dynamic';
export async function GET() {
  const last = getLastSyncedAt();
  const pending = db.$client.prepare("SELECT 1 FROM sync_request WHERE task='collect'").get();
  const job = db.$client.prepare("SELECT status FROM job_run WHERE task='collect' ORDER BY started_at DESC LIMIT 1").get() as {status: string} | undefined;
  return NextResponse.json({ lastSyncedAt: last, ageMinutes: last ? Math.round((Date.now()-last)/60000) : null, watcherAlive: watcherAlive(), refreshing: Boolean(pending), status: job?.status ?? null });
}
export async function POST(req: Request) {
  if (!isLocalWrite(req)) return NextResponse.json({ error: '请求来源不允许' }, { status: 403 });
  if (!hasLogin('douyin')) return NextResponse.json({ started: false, reason: '请先登录抖音；其他平台请在监控页同步' });
  ensureWatcher();
  const result = db.$client.prepare("INSERT OR IGNORE INTO sync_request (task, requested_at) VALUES ('collect', ?)").run(Date.now());
  return NextResponse.json({ started: Boolean(result.changes), reason: result.changes ? null : '抖音采集已在队列中' });
}
