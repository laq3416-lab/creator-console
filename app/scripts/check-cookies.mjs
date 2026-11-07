/**
 * 排查某个平台的登录 cookie：打印 Cookie 库里所有域名和名字。
 * 猜不到登录标记时用这个。
 *
 * 用法：node scripts/check-cookies.mjs xygj
 */
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { profileDir } from './lib/paths.mjs';

const platform = process.argv[2] || 'douyin';
const base = profileDir(platform);
const candidates = [
  path.join(base, 'Default', 'Network', 'Cookies'),
  path.join(base, 'Default', 'Cookies'),
  path.join(base, 'Cookies'),
];
const file = candidates.find((f) => fs.existsSync(f));
if (!file) {
  console.log(`没找到 Cookies 文件：${base}`);
  process.exit(1);
}

// 复制一份再读，避免浏览器锁库
const tmp = path.join('/tmp', `cookies-${platform}.db`);
fs.copyFileSync(file, tmp);
const db = new Database(tmp, { readonly: true });
const rows = db
  .prepare('SELECT host_key, name, length(encrypted_value) len FROM cookies ORDER BY len DESC')
  .all();
console.log(`${platform} 共 ${rows.length} 条 cookie`);
for (const r of rows.slice(0, 25)) {
  console.log(`  ${String(r.host_key).padEnd(30)} ${String(r.name).padEnd(34)} ${r.len}`);
}
