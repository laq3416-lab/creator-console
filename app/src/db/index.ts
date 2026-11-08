import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';
import { DATA_ROOT, DB_FILE } from '@/lib/paths';

const DATA_DIR = DATA_ROOT;
const DB_FILE_PATH = DB_FILE;
const SCHEMA_FILE = path.join(process.cwd(), 'src', 'db', 'schema.sql');

function createDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const sqlite = new Database(DB_FILE_PATH);
  sqlite.pragma('busy_timeout = 10000');
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  // 首次启动时建表。schema.sql 是 DDL 的唯一来源。
  if (fs.existsSync(SCHEMA_FILE)) {
    sqlite.exec(fs.readFileSync(SCHEMA_FILE, 'utf8'));
  }

  // 兼容早期数据库；多个构建进程可能同时尝试迁移。
  for (const [table, column, type] of [['content', 'video_url', 'TEXT'], ['benchmark_content', 'video_url', 'TEXT'], ['benchmark_content', 'first_seen_at', 'INTEGER']]) {
    const columns = () => sqlite.pragma(`table_info(${table})`) as { name: string }[];
    if (!columns().some((c) => c.name === column)) {
      try { sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`); }
      catch (e) { if (!columns().some((c) => c.name === column)) throw e; }
    }
  }

  return drizzle(sqlite, { schema });
}

// dev 模式热更新会重复执行模块，挂到 globalThis 上避免开多个连接
const globalForDb = globalThis as unknown as { __db?: ReturnType<typeof createDb> };
export const db = globalForDb.__db ?? createDb();
if (process.env.NODE_ENV !== 'production') globalForDb.__db = db;

export * from './schema';
