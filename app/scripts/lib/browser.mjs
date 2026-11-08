import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

/** 登录态只存在本机的 .data 目录，不进源码树，也不上传 */
import { profileDir as profileDir_, hasLogin } from './paths.mjs';

const CHANNEL_CANDIDATES = ['msedge', 'chrome'];

/**
 * 用系统已装的 Chromium 内核（Edge / Chrome）启动带持久化 Profile 的浏览器。
 * 不下载 playwright 自带浏览器，省 150MB，也避免版本对不上。
 */
export async function launch({ headless = false, platform = 'douyin' } = {}) {
  const profileDir = profileDir_(platform);
  fs.mkdirSync(profileDir, { recursive: true });

  const errors = [];
  for (const channel of CHANNEL_CANDIDATES) {
    try {
      const ctx = await chromium.launchPersistentContext(profileDir, {
        channel,
        headless,
        viewport: null,
        locale: 'zh-CN',
        timezoneId: 'Asia/Shanghai',
        args: [
          '--disable-blink-features=AutomationControlled',
          '--no-default-browser-check',
          // macOS 每次启动都会弹「找不到钥匙串」——改用本地密码库，不碰 Keychain
          '--password-store=basic',
          '--use-mock-keychain',
          // 定时任务用屏幕外窗口：还是真窗口（无头会被判机器人），但不打扰你
          ...(process.env.SCREEN_OFF === '1'
            ? ['--window-position=-3200,-3200', '--window-size=1280,860']
            : []),
        ],
        ignoreDefaultArgs: ['--enable-automation'],
      });
      ctx.setDefaultTimeout(45000);
      // macOS may clamp off-screen coordinates back onto the visible display.
      // Minimize only unattended collection windows; interactive login stays visible.
      if (process.env.SCREEN_OFF === '1' && !headless) {
        const page = ctx.pages()[0] ?? await ctx.newPage();
        try {
          const session = await ctx.newCDPSession(page);
          try {
          const { windowId } = await session.send('Browser.getWindowForTarget');
          await session.send('Browser.setWindowBounds', { windowId, bounds: { windowState: 'minimized' } });
          } finally {
            await session.detach();
          }
        } catch (e) {
          console.warn('无法最小化后台窗口，继续采集:', e.message);
        }
      }
      return { ctx, channel };
    } catch (e) {
      errors.push(`  ${channel}: ${e.message.split('\n')[0]}`);
    }
  }

  throw new Error(
    `找不到可用的 Chromium 内核。请装 Edge 或 Chrome 后重试。\n${errors.join('\n')}`,
  );
}

/** 用 Cookies 库判断（比 ctx.cookies 更准，能区分平台） */
export async function hasPlatformLogin(platform) {
  return hasLogin(platform);
}

/** 兼容旧调用 */
export async function hasDouyinSession() {
  return hasLogin('douyin');
}
