/**
 * 嗅探脚本：把创作者后台真实的 XHR 响应录下来，供写解析器时对照。
 *
 * 为什么要这一步：抖音的数据不在 HTML 里，是接口返回的 JSON。
 * 接口地址和字段名会变，硬猜写出来的解析器必然失效。
 * 所以先录一份真实响应，按真实字段写。
 *
 * 用法：npm run collect:spy
 * 产物：data/spy/raw/*.json  +  data/spy/index.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';
import { dir, hasLogin } from './lib/paths.mjs';

const PLATFORM = process.argv[2] || 'douyin';

const CONFIG = {
  douyin: {
    name: '抖音',
    domain: /douyin\.com/,
    routes: [
      ['首页概览', 'https://creator.douyin.com/creator-micro/home'],
      ['作品管理', 'https://creator.douyin.com/creator-micro/content/manage'],
      ['内容数据', 'https://creator.douyin.com/creator-micro/data/content'],
      ['粉丝数据', 'https://creator.douyin.com/creator-micro/data/following/index'],
    ],
  },
  xhs: {
    name: '小红书',
    domain: /xiaohongshu\.com/,
    routes: [
      ['创作首页', 'https://creator.xiaohongshu.com/new/home'],
      ['笔记管理', 'https://creator.xiaohongshu.com/new/note-manager'],
      ['笔记数据', 'https://creator.xiaohongshu.com/statistics/note-statistics'],
      ['粉丝数据', 'https://creator.xiaohongshu.com/statistics/fans-data'],
      ['消息中心', 'https://creator.xiaohongshu.com/notification'],
    ],
  },
  xygj: {
    name: '闲管家',
    domain: /goofish\.(pro|com)/,
    routes: [
      ['商家首页', 'https://www.goofish.pro/'],
      ['商品管理', 'https://www.goofish.pro/items'],
      ['数据中心', 'https://www.goofish.pro/data'],
    ],
  },
  xianyu: {
    name: '闲鱼',
    domain: /goofish\.com/,
    routes: [
      ['首页', 'https://www.goofish.com/'],
      ['我发布的', 'https://www.goofish.com/personal'],
      ['消息', 'https://www.goofish.com/im'],
    ],
  },
};

const CFG = CONFIG[PLATFORM];
if (!CFG) {
  console.error(`未知平台：${PLATFORM}`);
  process.exit(1);
}

const OUT = dir('spy', PLATFORM);
const RAW = path.join(OUT, 'raw');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(RAW, { recursive: true });

const MAX_BODY = 3 * 1024 * 1024;
let seq = 0;
const captured = [];

function shouldCapture(url, contentType) {
  if (!CFG.domain.test(url)) return false;
  if (!/json|text\/plain/.test(contentType || '')) return false;
  if (/\.(js|css|png|jpe?g|webp|gif|svg|woff2?|ttf|mp4)(\?|$)/i.test(url)) return false;
  if (/monitor|slardar|log\.douyin|report|beacon|abtest|collect/i.test(url)) return false;
  return true;
}

function attach(page) {
  page.on('response', async (res) => {
    try {
      const url = res.url();
      const ct = res.headers()['content-type'] || '';
      if (!shouldCapture(url, ct)) return;

      const body = await res.text();
      if (!body || body.length > MAX_BODY) return;
      if (!/^[[{]/.test(body.trim().slice(0, 1))) return;

      const req = res.request();
      const id = String(++seq).padStart(4, '0');
      const record = {
        id,
        url,
        method: req.method(),
        status: res.status(),
        contentType: ct,
        capturedAt: new Date().toISOString(),
        pageUrl: page.url(),
        postData: req.postData() ?? null,
        body: JSON.parse(body),
      };
      fs.writeFileSync(path.join(RAW, `${id}.json`), JSON.stringify(record, null, 2));
      captured.push(record);

      const u = new URL(url);
      console.log(`  + ${id} ${req.method()} ${u.pathname}${u.search ? '?…' : ''} (${(body.length / 1024).toFixed(0)}KB)`);
    } catch {
      /* 单个响应失败不影响整体 */
    }
  });
}

const { ctx, channel } = await launch({ headless: false, platform: PLATFORM });
console.log(`浏览器已启动（${channel}）· ${CFG.name}\n`);

if (!(await hasLogin(PLATFORM))) {
  console.log(`❌ ${CFG.name} 没有登录态。先跑：node scripts/login.mjs ${PLATFORM}`);
  await ctx.close();
  process.exit(1);
}

ctx.on('page', attach);
for (const p of ctx.pages()) attach(p);

const page = ctx.pages()[0] ?? (await ctx.newPage());

// 逐个访问关键页面，每页留时间让前端把数据请求发完
const ROUTES = CFG.routes;

for (const [name, url] of ROUTES) {
  console.log(`\n▶ ${name}`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch {
    console.log('  （跳转超时，继续）');
  }
  await page.waitForTimeout(7000);
}

// 留一段时间给你自己点，比如点开某条作品看详情
const IDLE_SEC = Number(process.env.SPY_IDLE_SEC || 45);
console.log(`\n▶ 接下来 ${IDLE_SEC} 秒你可以自己点：`);
console.log('   · 点开任意一条作品，看单作品数据页');
console.log('   · 点「数据」→「作品数据」，切换时间范围');
console.log('   · 点粉丝画像，随便点几下');
await page.waitForTimeout(IDLE_SEC * 1000);

// 汇总
const byPath = new Map();
for (const r of captured) {
  const u = new URL(r.url);
  const key = u.pathname;
  const cur = byPath.get(key) ?? { path: key, count: 0, bytes: 0, hosts: new Set() };
  cur.count += 1;
  cur.bytes += JSON.stringify(r.body).length;
  cur.hosts.add(u.host);
  byPath.set(key, cur);
}

const index = {
  capturedAt: new Date().toISOString(),
  total: captured.length,
  endpoints: [...byPath.values()]
    .map((e) => ({ path: e.path, count: e.count, kb: Math.round(e.bytes / 1024), host: [...e.hosts][0] }))
    .sort((a, b) => b.count - a.count),
};
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 2));

console.log(`\n✅ 共录到 ${captured.length} 个接口响应`);
console.log(`   产物：data/spy/raw/ 与 data/spy/index.json`);
console.log('\n   把 index.json 发我，或者直接说「录好了」，我来读。');

await ctx.close();
process.exit(0);
