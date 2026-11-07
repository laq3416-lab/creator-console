/**
 * 抖音采集器（管道 A：创作者后台）
 *
 * 取数方式：导航到创作者中心的真实页面，被动接收前端发出的 XHR 响应，
 * 不做 JS 签名逆向、不构造请求。平台改接口时，这里大概率还能活；
 * 改页面结构时，最多是导航路径要调。
 *
 * 用法：npm run collect
 */
import { launch, hasDouyinSession } from './lib/browser.mjs';
import { ingest, openDb } from './lib/ingest.mjs';
import { parseAccount, parseWorks, parseOverview } from './lib/douyin.mjs';

const BASE = 'https://creator.douyin.com';
const buckets = { user: null, overview: null, worklist: null };

function num(v) {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function attach(page) {
  page.on('response', async (res) => {
    const url = res.url();
    if (!/douyin\.com/.test(url)) return;
    try {
      if (/\/aweme\/v1\/creator\/user\/info\//.test(url) && !buckets.user) {
        buckets.user = await res.json();
      } else if (/\/aweme\/janus\/creator\/data\/overview\/all\//.test(url) && !buckets.overview) {
        buckets.overview = await res.json();
      } else if (/\/janus\/douyin\/creator\/pc\/work_list/.test(url)) {
        const j = await res.json();
        // 同一页会打两次（一次简版一次全量），留条数多的那份
        if (!buckets.worklist || (j.items?.length ?? 0) > (buckets.worklist.items?.length ?? 0)) {
          buckets.worklist = j;
        }
      }
    } catch {
      /* 响应体读失败就跳过 */
    }
  });
}

/* ---------- 主流程 ---------- */

const { ctx, channel } = await launch({ headless: false });
console.log(`浏览器已启动（${channel}）`);

if (!(await hasDouyinSession(ctx))) {
  console.log('❌ 没有登录态，先跑：npm run collect:login');
  await ctx.close();
  process.exit(1);
}

ctx.on('page', attach);
for (const p of ctx.pages()) attach(p);

const page = ctx.pages()[0] ?? (await ctx.newPage());

console.log('▶ 打开首页概览…');
await page.goto(`${BASE}/creator-micro/home`, { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(8000);

console.log('▶ 打开作品管理…');
await page.goto(`${BASE}/creator-micro/content/manage`, { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(10000);

await ctx.close();

/* ---------- 组装 ---------- */

if (!buckets.user) {
  console.log('❌ 没抓到 user/info，可能登录态失效或被风控。');
  process.exit(1);
}

const acc = parseAccount(buckets.user, buckets.worklist?.total ?? 0);
const contents = parseWorks(buckets.worklist, acc.id);
const series = parseOverview(buckets.overview, acc.id, acc.followerCount);

console.log(`\n解析结果：账号 ${acc.handle} / 粉丝 ${acc.followerCount} / 作品 ${contents.length} 条 / 指标点 ${series.length} 个`);

const db = openDb();
const res = ingest({ accounts: [acc], contents, series }, db);

console.log(`\n写入：账号 ${res.written.accounts} / 作品 ${res.written.contents} / 指标点 ${res.written.series}`);
if (res.rejected) {
  console.log(`被契约校验拒绝 ${res.rejected} 条：`);
  for (const e of res.errors.slice(0, 10)) {
    const label = e.item.title ?? e.item.handle ?? '(未知)';
    console.log(`  ✗ ${label} → ${e.errors.join('；')}`);
  }
}

const top = db
  .prepare(
    `SELECT c.title, mp.value AS plays, c.duration_sec
       FROM content c
       JOIN metric_point mp ON mp.entity_id = c.id AND mp.key = 'plays'
      ORDER BY mp.value DESC LIMIT 5`,
  )
  .all();
console.log('\n播放前 5：');
for (const t of top) console.log(`  ${String(t.plays).padStart(6)}  ${t.duration_sec ?? '?'}s  ${t.title.slice(0, 28)}`);

console.log('\n✅ 打开 http://127.0.0.1:3300 看效果');
process.exit(0);
