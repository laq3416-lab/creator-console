import path from 'node:path';
import fs from 'node:fs';

/** 和 scripts/lib/paths.mjs 保持同步：运行数据在项目目录之外的 .data */
export const DATA_ROOT = process.env.CONSOLE_DATA_DIR
  ? path.resolve(process.env.CONSOLE_DATA_DIR)
  : path.resolve(process.cwd(), '..', '.data');

export const DB_FILE = path.join(DATA_ROOT, 'console.db');
export const WATCHER_FILE = path.join(DATA_ROOT, 'watcher.json');

export const PLATFORMS = ['douyin', 'xhs', 'xianyu'] as const;
export type PlatformKey = (typeof PLATFORMS)[number];

export const PLATFORM_META: Record<PlatformKey, { name: string; loginUrl: string; cookieHost: string; cookieName: string }> = {
  douyin: { name: '抖音', loginUrl: 'https://creator.douyin.com/', cookieHost: 'douyin.com', cookieName: 'sessionid' },
  xhs: { name: '小红书', loginUrl: 'https://www.xiaohongshu.com/', cookieHost: 'xiaohongshu.com', cookieName: 'web_session' },
  xianyu: { name: '闲鱼', loginUrl: 'https://www.goofish.com/', cookieHost: 'goofish.com', cookieName: 'unb' },
};

export function profileDir(platform: string) {
  return path.join(DATA_ROOT, 'profiles', platform);
}

// 旧版本只有一个 browser-profile，迁移给抖音（幂等）
(() => {
  const legacy = path.join(DATA_ROOT, 'browser-profile');
  const target = path.join(DATA_ROOT, 'profiles', 'douyin');
  try {
    if (fs.existsSync(legacy) && !fs.existsSync(target)) {
      fs.mkdirSync(path.join(DATA_ROOT, 'profiles'), { recursive: true });
      fs.renameSync(legacy, target);
    }
  } catch {}
})();
