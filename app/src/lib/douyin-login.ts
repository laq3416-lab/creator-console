import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { profileDir, PLATFORM_META, type PlatformKey } from './paths';

/**
 * 判定某个平台是否真的登录了。
 *
 * 不能只看 Cookies 文件存不存在：浏览器一打开就会建这个文件。
 * 要真的去 Cookies 库里找对应平台的 session cookie。
 */
export function hasLogin(platform: PlatformKey): boolean {
  const meta = PLATFORM_META[platform];
  if (!meta) return false;

  const base = profileDir(platform);
  const candidates = [
    path.join(base, 'Default', 'Network', 'Cookies'),
    path.join(base, 'Default', 'Cookies'),
    path.join(base, 'Cookies'),
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      const db = new Database(file, { readonly: true, fileMustExist: true });
      const row = db
        .prepare(
          `SELECT COUNT(*) AS n FROM cookies
            WHERE host_key LIKE ? AND name = ? AND length(encrypted_value) > 20`,
        )
        .get(`%${meta.cookieHost}`, meta.cookieName) as { n: number };
      db.close();
      if (row.n > 0) return true;
    } catch {
      // 浏览器锁着库时读不到，当作未登录
    }
  }
  return false;
}

export const hasDouyinLogin = () => hasLogin('douyin');
