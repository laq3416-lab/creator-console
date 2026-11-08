/**
 * 入库管道：所有数据源（采集器 / 手动导入 / 冒烟测试）都从这里进库。
 * 先校验，再写；被拒的记录原样返回，不吞。
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { validateBatch } from './validate.mjs';
import { DB_FILE } from './paths.mjs';

export function openDb(dbFile = DB_FILE) {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
  const db = new Database(dbFile);
  db.pragma('busy_timeout = 10000');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const schema = path.join(process.cwd(), 'src', 'db', 'schema.sql');
  if (fs.existsSync(schema)) db.exec(fs.readFileSync(schema, 'utf8'));
  for (const [table, column, type] of [['content', 'video_url', 'TEXT'], ['benchmark_content', 'video_url', 'TEXT'], ['benchmark_content', 'first_seen_at', 'INTEGER']]) {
    const columns = () => db.pragma(`table_info(${table})`);
    if (!columns().some((c) => c.name === column)) {
      try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`); }
      catch (e) { if (!columns().some((c) => c.name === column)) throw e; }
    }
  }
  return db;
}

const slug = (s) =>
  String(s)
    .replace(/^@/, '')
    .replace(/[^\w\u4e00-\u9fa5-]/g, '_')
    .slice(0, 40);

export const accountId = (platform, handle) => `acc_${platform}_${slug(handle)}`;
export const contentId = (platform, externalId) => `c_${platform}_${externalId}`;

/**
 * 写入一批数据。
 * 返回 { written, rejected, errors }，调用方必须把 rejected 打出来。
 */
export function ingest({ accounts = [], contents = [], series = [] }, db = openDb()) {
  const { okAccounts, badAccounts, okContents, badContents } = validateBatch({ accounts, contents });
  const now = Date.now();
  const rejected = [...badAccounts, ...badContents];

  const upAcc = db.prepare(`
    INSERT INTO account (id, workspace_id, platform, handle, nickname, avatar_url, follower_count, work_count, last_synced_at)
    VALUES (@id, 'default', @platform, @handle, @nickname, @avatarUrl, @followerCount, @workCount, @syncedAt)
    ON CONFLICT(id) DO UPDATE SET
      follower_count = excluded.follower_count,
      work_count     = excluded.work_count,
      nickname       = coalesce(excluded.nickname, account.nickname),
      avatar_url     = coalesce(excluded.avatar_url, account.avatar_url),
      last_synced_at = excluded.last_synced_at
  `);

  const upContent = db.prepare(`
    INSERT INTO content (id, account_id, platform, type, title, url, published_at, duration_sec, video_url)
    VALUES (@id, @accountId, @platform, @type, @title, @url, @publishedAt, @durationSec, @videoUrl)
    ON CONFLICT(id) DO UPDATE SET
      title        = excluded.title,
      published_at = excluded.published_at,
      duration_sec = excluded.duration_sec,
      video_url    = COALESCE(excluded.video_url, content.video_url)
  `);

  const insPoint = db.prepare(`
    INSERT INTO metric_point (entity_type, entity_id, key, value, captured_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const a of okAccounts) {
      upAcc.run({
        id: a.id ?? accountId(a.platform, a.handle),
        platform: a.platform,
        handle: a.handle,
        nickname: a.nickname ?? null,
        avatarUrl: a.avatarUrl ?? null,
        followerCount: a.followerCount,
        workCount: a.workCount ?? 0,
        syncedAt: a.syncedAt ?? now,
      });
    }

    for (const c of okContents) {
      const accId = c.accountId ?? accountId(c.platform, c.accountHandle ?? '');
      upContent.run({
        id: contentId(c.platform, c.externalId),
        accountId: accId,
        platform: c.platform,
        type: c.type ?? 'video',
        title: c.title,
        url: c.url ?? null,
        publishedAt: c.publishedAt,
        durationSec: c.durationSec ?? null,
        videoUrl: c.videoUrl ?? null,
      });

      const cid = contentId(c.platform, c.externalId);
      const at = c.capturedAt ?? now;
      for (const [key, value] of Object.entries(c.metrics ?? {})) {
        if (value == null) continue;
        // 同一个点重复采集时不重复写，避免图表抖
        const exists = db
          .prepare('SELECT 1 FROM metric_point WHERE entity_type=? AND entity_id=? AND key=? AND captured_at=?')
          .get('content', cid, key, at);
        if (!exists) insPoint.run('content', cid, key, value, at);
      }
    }

    for (const s of series) {
      const eid = s.entityId;
      const exists = db
        .prepare('SELECT 1 FROM metric_point WHERE entity_type=? AND entity_id=? AND key=? AND captured_at=?')
        .get('account', eid, s.key, s.capturedAt);
      if (!exists) insPoint.run('account', eid, s.key, s.value, s.capturedAt);
    }
  });

  tx();

  return {
    written: { accounts: okAccounts.length, contents: okContents.length, series: series.length },
    rejected: rejected.length,
    errors: rejected,
  };
}
