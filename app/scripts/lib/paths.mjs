/**
 * 运行时数据一律放在项目目录之外（repo/.data），原因有三个：
 *  1. Turbopack 会把项目内的 data/ 当源码扫描，浏览器 Profile 里的文件会直接把构建打崩
 *  2. 登录态和采集产物不该出现在源码树里，容易误提交
 *  3. 换机器时拷 .data 就能搬走全部状态，源码树是干净的
 */
import path from 'node:path';
import fs from 'node:fs';
import Database from 'better-sqlite3';

export const APP_ROOT = process.cwd();
export const DATA_ROOT = process.env.CONSOLE_DATA_DIR
  ? path.resolve(process.env.CONSOLE_DATA_DIR)
  : path.resolve(APP_ROOT, '..', '.data');

export const DB_FILE = path.join(DATA_ROOT, 'console.db');

/** 每个平台一个独立 Profile，否则登录态会互相覆盖 */
export const PLATFORMS = ['douyin', 'xhs', 'xianyu'];
export const PROFILES_ROOT = path.join(DATA_ROOT, 'profiles');
export function profileDir(platform) {
  return path.join(PROFILES_ROOT, platform);
}

/** 旧版本只有一个 browser-profile，迁移给抖音 */
const LEGACY = path.join(DATA_ROOT, 'browser-profile');
if (fs.existsSync(LEGACY) && !fs.existsSync(profileDir('douyin'))) {
  try {
    fs.mkdirSync(PROFILES_ROOT, { recursive: true });
    fs.renameSync(LEGACY, profileDir('douyin'));
  } catch {}
}

// 兼容旧引用
export const PROFILE_DIR = profileDir('douyin');
export const WATCHER_FILE = path.join(DATA_ROOT, 'watcher.json');
export const dir = (...p) => path.join(DATA_ROOT, ...p);

/** 每个平台的登录标记 cookie */
const SESSION_COOKIE = {
  douyin: { host: 'douyin.com', name: 'sessionid' },
  xhs: { host: 'xiaohongshu.com', name: 'web_session' },
  xianyu: { host: 'goofish.com', name: 'unb' },
  xygj: { host: 'goofish.com', name: 'unb' },
};

/** 有没有真的登录（查 Cookies 库里有没有对应 session cookie） */
export async function hasLogin(platform = 'douyin') {
  const mark = SESSION_COOKIE[platform];
  if (!mark) return false;
  const base = profileDir(platform);
  const candidates = [
    path.join(base, 'Default', 'Network', 'Cookies'),
    path.join(base, 'Default', 'Cookies'),
    path.join(base, 'Cookies'),
  ];
  for (const f of candidates) {
    if (!fs.existsSync(f)) continue;
    try {
      const db = new Database(f, { readonly: true, fileMustExist: true });
      const row = db
        .prepare(
          `SELECT COUNT(*) n FROM cookies WHERE host_key LIKE ? AND name = ? AND length(encrypted_value) > 20`,
        )
        .get(`%${mark.host}`, mark.name);
      db.close();
      if (row?.n > 0) return true;
    } catch {}
  }
  return false;
}

export const hasDouyinLogin = () => hasLogin('douyin');

/** 旧接口：直接扫某个 profile 目录 */
async function _legacyHasDouyinLogin() {
  const fs = await import('node:fs');
  const Database = (await import('better-sqlite3')).default;
  const candidates = [
    path.join(PROFILE_DIR, 'Default', 'Network', 'Cookies'),
    path.join(PROFILE_DIR, 'Default', 'Cookies'),
    path.join(PROFILE_DIR, 'Cookies'),
  ];
  for (const f of candidates) {
    if (!fs.existsSync(f)) continue;
    try {
      const db = new Database(f, { readonly: true, fileMustExist: true });
      const row = db
        .prepare(
          `SELECT COUNT(*) n FROM cookies WHERE host_key LIKE '%douyin.com' AND name='sessionid' AND length(encrypted_value) > 20`,
        )
        .get();
      db.close();
      if (row?.n > 0) return true;
    } catch {}
  }
  return false;
}

/**
 * 哪些平台可以无头运行（不弹窗）。
 * 实测：小红书可以；闲鱼会返回「非法访问」；抖音直接判机器人。
 */
export const HEADLESS_OK = new Set(['xhs']);
