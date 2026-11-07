/**
 * IM 页面的自动取证：既抓 XHR，也抓 WebSocket 帧。
 *
 * 为什么需要：私信页面可能用长连接（WebSocket），
 * 普通 XHR 嗅探什么都看不到。这里把两种通道都录下来，
 * 全程脚本自己点，不需要人操作。
 *
 * 用法：node scripts/spy-im.mjs xhs|xianyu|douyin
 */
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';
import { dir, hasLogin } from './lib/paths.mjs';

const PLATFORM = process.argv[2] || 'xhs';

const TARGETS = {
  xhs: {
    name: '小红书（消费端）',
    // 私信在 www，不在创作者平台
    urls: ['https://www.xiaohongshu.com/messages', 'https://www.xiaohongshu.com/explore'],
    clickTexts: ['消息', '私信'],
    domain: /xiaohongshu\.com/,
  },
  douyin: {
    name: '抖音',
    urls: [
      'https://creator.douyin.com/creator-micro/message',
      'https://creator.douyin.com/creator-micro/interaction',
    ],
    clickTexts: ['私信', '消息', '互动管理'],
    domain: /douyin\.com/,
  },
  xianyu: {
    name: '闲鱼',
    urls: ['https://www.goofish.com/im'],
    clickTexts: ['消息'],
    domain: /goofish\.com/,
  },
};

const T = TARGETS[PLATFORM];
if (!T) {
  console.error('未知平台');
  process.exit(1);
}

const OUT = dir('spy', `${PLATFORM}-im`);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

if (!(await hasLogin(PLATFORM))) {
  console.error(`❌ ${T.name} 未登录`);
  process.exit(1);
}

const xhr = [];
const frames = [];
const sockets = [];

const { ctx } = await launch({ headless: false, platform: PLATFORM });
console.log(`浏览器已启动 · ${T.name}`);

const hook = (page) => {
  page.on('response', async (res) => {
    const u = res.url();
    if (!T.domain.test(u)) return;
    if (!/json/.test(res.headers()['content-type'] || '')) return;
    try {
      const t = await res.text();
      if (t.length < 200 || t.length > 2_000_000) return;
      xhr.push({ url: u, body: JSON.parse(t) });
    } catch {}
  });

  page.on('websocket', (ws) => {
    sockets.push(ws.url());
    console.log(`  ws: ${ws.url().slice(0, 80)}`);
    ws.on('framereceived', (f) => {
      const payload = typeof f.payload === 'string' ? f.payload : f.payload.toString('utf8');
      if (payload && payload.length > 20) frames.push({ url: ws.url(), payload });
    });
    ws.on('framesent', (f) => {
      const payload = typeof f.payload === 'string' ? f.payload : f.payload.toString('utf8');
      if (payload && payload.length > 20) frames.push({ url: ws.url(), payload, sent: true });
    });
  });
};

ctx.on('page', hook);
for (const p of ctx.pages()) hook(p);

const page = ctx.pages()[0] ?? (await ctx.newPage());

// 先进首页，再点消息入口（很多站直接 goto 不会触发数据请求）
console.log('▶ 打开首页');
await page.goto(
  PLATFORM === 'xhs'
    ? 'https://www.xiaohongshu.com/explore'
    : PLATFORM === 'douyin'
      ? 'https://creator.douyin.com/creator-micro/home'
      : T.urls[0],
  {
  waitUntil: 'domcontentloaded',
  timeout: 40000,
}).catch(() => {});
await page.waitForTimeout(5000);

let clicked = false;
for (const text of T.clickTexts) {
  try {
    const el = page.locator(`text=${text}`).first();
    if (await el.count()) {
      await el.click({ timeout: 3000 });
      console.log(`▶ 点击「${text}」`);
      clicked = true;
      break;
    }
  } catch {}
}

if (!clicked) {
  console.log('▶ 没找到入口文字，直接跳转');
  await page.goto(T.urls[0], { waitUntil: 'domcontentloaded' }).catch(() => {});
}

await page.waitForTimeout(12000);
// 点开第一个会话，触发消息正文加载
try {
  const first = page.locator('[class*="conversation"], [class*="session"], [class*="contact"]').first();
  if (await first.count()) {
    await first.click({ timeout: 3000 });
    console.log('▶ 点开第一个会话');
    await page.waitForTimeout(6000);
  }
} catch {}

await page.waitForTimeout(5000);

console.log(`\nXHR ${xhr.length} 条 / WebSocket ${sockets.length} 个 / 帧 ${frames.length} 条`);

fs.writeFileSync(path.join(OUT, 'xhr.json'), JSON.stringify(xhr, null, 2));
fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify(frames, null, 2));

// 汇总：出现次数最多的接口
const byPath = new Map();
for (const r of xhr) {
  const k = new URL(r.url).pathname;
  byPath.set(k, (byPath.get(k) ?? 0) + 1);
}
console.log('\n有响应的接口：');
for (const [k, n] of [...byPath].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`  ${n}x ${k}`);
}

await ctx.close();
process.exit(0);
