/**
 * 闲鱼采集：我发布的商品
 *
 * 注意能力边界：闲鱼网页版只返回商品本体（标题/价格/状态），
 * 曝光、浏览、想要、成交这些经营数据只有闲管家或 App 里有。
 * 所以这里只采能采到的，不编造。
 *
 * 用法：npm run collect:xianyu
 */
import { launch } from './lib/browser.mjs';
import { hasLogin } from './lib/paths.mjs';
import { ingest, openDb } from './lib/ingest.mjs';

const buckets = { items: null, head: null };

function attach(page) {
  page.on('response', async (res) => {
    const url = res.url();
    if (!/goofish\.com/.test(url)) return;
    try {
      if (/xyh\.item\.list/.test(url)) {
        const j = await res.json();
        const list = j?.data?.cardList ?? [];
        if (list.length) buckets.items = list;
      } else if (/user\.page\.head/.test(url) && !buckets.head) {
        buckets.head = await res.json();
      }
    } catch {}
  });
}

const { ctx, channel } = await launch({ headless: false, platform: 'xianyu' });
console.log(`浏览器已启动（${channel}）`);

if (!(await hasLogin('xianyu'))) {
  console.log('❌ 没有登录态，先跑：node scripts/login.mjs xianyu');
  await ctx.close();
  process.exit(1);
}

ctx.on('page', attach);
for (const p of ctx.pages()) attach(p);
const page = ctx.pages()[0] ?? (await ctx.newPage());

console.log('▶ 打开闲鱼…');
await page.goto('https://www.goofish.com/', { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(6000);

console.log('▶ 打开我发布的…');
await page.goto('https://www.goofish.com/personal', { waitUntil: 'domcontentloaded' }).catch(() => {});
await page.waitForTimeout(9000);
await page.mouse.wheel(0, 1500);
await page.waitForTimeout(3000);

await ctx.close();

if (!buckets.items?.length) {
  console.log('❌ 没抓到商品列表。可能登录态失效，或闲鱼改了页面。');
  process.exit(1);
}

const head = buckets.head?.data ?? {};
const nick = head.userInfo?.nick ?? head.nick ?? '闲鱼卖家';
const accId = 'acc_xianyu_main';

const acc = {
  id: accId,
  platform: 'xianyu',
  handle: `@${nick}`,
  nickname: nick,
  followerCount: Number(head.followerCount ?? head.fansNum ?? 0) || 0,
  workCount: buckets.items.length,
  syncedAt: Date.now(),
};

const contents = buckets.items.map((c) => {
  const d = c.cardData ?? c;
  const itemId = String(d.id ?? d.detailParams?.itemId ?? '');
  const price = Number(d.priceInfo?.price ?? d.detailParams?.soldPrice ?? 0) || undefined;
  const labels = (d.itemLabelDataVO?.labelData?.r2?.tagList ?? []).map((t) => t?.data?.content).filter(Boolean);

  return {
    platform: 'xianyu',
    accountId: accId,
    externalId: itemId,
    type: 'item',
    title: String(d.title ?? '（无标题）').slice(0, 200),
    publishedAt: Date.now(),   // 列表没有发布时间，用采集时间占位
    durationSec: null,
    url: `https://www.goofish.com/item?id=${itemId}`,
    metrics: {
      ...(price ? { price } : {}),
      ...(labels.length ? { labels: labels.length } : {}),
    },
  };
}).filter((c) => c.externalId);

console.log(`\n解析：${nick} / 商品 ${contents.length} 件`);

const db = openDb();
const res = ingest({ accounts: [acc], contents, series: [] }, db);
console.log(`写入：账号 ${res.written.accounts} / 商品 ${res.written.contents}`);
if (res.rejected) {
  console.log(`被拒 ${res.rejected} 条：`);
  for (const e of res.errors.slice(0, 5)) console.log('  ✗', e.errors.join('；'));
}

console.log('\n价格区间：');
const prices = contents.map((c) => c.metrics.price).filter(Boolean).sort((a, b) => a - b);
if (prices.length) console.log(`  ¥${prices[0]} – ¥${prices[prices.length - 1]}（中位 ¥${prices[Math.floor(prices.length / 2)]}）`);

process.exit(0);
