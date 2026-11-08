import { isLocalWrite } from '@/lib/local-request';
import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { db } from '@/db';
import Database from 'better-sqlite3';
import { DATA_ROOT } from '@/lib/paths';

export const dynamic = 'force-dynamic';
let creating = false;
export async function POST(req: Request) {
  if (!isLocalWrite(req)) return NextResponse.json({ error: '请求来源不允许' }, { status: 403 });
  if (creating) return NextResponse.json({ error: '备份正在进行，请稍候' }, { status: 409 });
  creating = true;
  try {
    const dir = path.join(DATA_ROOT, 'backups');
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const name = `console-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.db`;
    const file = path.join(dir, name);
    const partial = file + '.partial';
    await db.$client.backup(partial);
    // 导出单文件快照：切换到 DELETE 模式，避免恢复时依赖 WAL / SHM 文件。
    const snapshot = new Database(partial);
    try {
      snapshot.pragma('journal_mode = DELETE');
      if (snapshot.pragma('integrity_check', { simple: true }) !== 'ok') throw new Error('备份完整性检查失败');
    } finally { snapshot.close(); }
    fs.chmodSync(partial, 0o600);
    fs.renameSync(partial, file);
    return NextResponse.json({ ok: true, path: file });
  } catch (e) {
    console.error('database backup failed', e);
    return NextResponse.json({ error: '备份失败，请检查磁盘是否挂载和可写' }, { status: 500 });
  } finally {
    creating = false;
  }
}
