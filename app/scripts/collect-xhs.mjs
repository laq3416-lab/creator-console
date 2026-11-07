/**
 * 小红书采集（创作者服务平台）
 * 用法：npm run collect:xhs
 */
import { launch } from './lib/browser.mjs';
import { hasLogin, HEADLESS_OK } from './lib/paths.mjs';
import { ingest, openDb } from './lib/ingest.mjs';
import { parseAccount, parseAccountSeries, parseNotes } from './lib/xhs.mjs';

const BASE = 'https://creator.xiaohongshu.com';
const buckets = { user: null, base: null, notes: [] };

function attach(page) {
  page.on('response', async (res) => {
    const url = res.url();
    if (!/xiaohongshu\.com/.test(url)) return;
    try {
      if (/\/api\/galaxy\/user\/info/.test(url) && !buckets.user) {
        buckets.user = await res.json();
      } else if (/datacenter\/account\/base/.test(url) && !buckets.base) {
        buckets.base = await res.json();
      } else if (/note\/user\/posted/.test(url)) {
        const j = await res.json();
        const list = j?.data?.notes ?? [];
        if (list.length) buckets.notes.push(...list);
      }
    } catch {}
  });
}

const { ctx, channel } = await launch({ headless: HEADLESS_OK.has('xhs'), platform: 'xhs' });
console.log(`浏览器已启动（${channel}）`);

if (!(await hasLogin('xhs'))) {
  console.log('❌ 没有登录态，先跑：node scripts/login.mjs xhs');
  await ctx.close();
  process.exit(1);
}

ctx.on('page', attach);
for (const p of ctx.pages()) attach(p);
const page = ctx.pages()[0] ?? (await ctx.newPage());

console.log('▶ 打开创作首页…');
await page.goto(`${BASE}/new/home`, { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(8000);

console.log('▶ 打开笔记管理…');
await page.goto(`${BASE}/new/note-manager`, { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(9000);

await ctx.close();

if (!buckets.user) {
  console.log('❌ 没抓到 user/info，可能登录态失效。');
  process.exit(1);
}

const acc = parseAccount(buckets.user);
const contents = parseNotes({ data: { notes: buckets.notes } }, acc.id);
const series = parseAccountSeries(buckets.base, acc.id);
acc.workCount = contents.length;

console.log(`\n解析：账号 ${acc.handle} / 笔记 ${contents.length} 条 / 指标点 ${series.length} 个`);

const db = openDb();
const res = ingest({ accounts: [acc], contents, series }, db);

console.log(`写入：账号 ${res.written.accounts} / 作品 ${res.written.contents} / 指标点 ${res.written.series}`);
if (res.rejected) {
  console.log(`被拒 ${res.rejected} 条：`);
  for (const e of res.errors.slice(0, 5)) console.log(`  ✗ ${e.errors.join('；')}`);
}

for (const n of contents.slice(0, 5)) {
  const m = n.metrics;
  console.log(`  ${String(m.plays ?? 0).padStart(5)} 浏览 / ${m.likes ?? 0} 赞  ${n.title.slice(0, 24)}`);
}

process.exit(0);
