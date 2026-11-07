/**
 * 小红书爆款雷达：搜索同赛道笔记，存进对标池。
 *
 * 限制：搜索接口不返回作者粉丝数，所以算不了赞粉比，
 * 这里按绝对点赞排序，并在页面上标注依据。
 *
 * 用法：npm run radar:xhs
 */
import { launch } from './lib/browser.mjs';
import { hasLogin } from './lib/paths.mjs';
import { openDb } from './lib/ingest.mjs';

const KEYWORDS = ['AI工具', 'AI副业', 'AI Agent', 'vibe coding', 'AI学习'];

function num(v) {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (s.endsWith('万')) return Math.round(parseFloat(s) * 10000) || 0;
  if (s.endsWith('亿')) return Math.round(parseFloat(s) * 1e8) || 0;
  return Number(s.replace(/[^\d.]/g, '')) || 0;
}

if (!(await hasLogin('xhs'))) {
  console.log('❌ 小红书未登录');
  process.exit(1);
}

const captured = new Map(); // noteId -> note
const { ctx } = await launch({ headless: false, platform: 'xhs' });

const hook = (p) => {
  p.on('response', async (r) => {
    if (!/search\/notes/.test(r.url())) return;
    try {
      const j = await r.json();
      const recs = j?.data?.records ?? j?.data?.items ?? [];
      for (const rec of recs) {
        const nc = rec.note_card ?? rec;
        const id = String(rec.id ?? nc.note_id ?? nc.id ?? '');
        if (!id) continue;
        captured.set(id, {
          id,
          title: (nc.display_title ?? nc.title ?? '').trim(),
          likes: num(nc.interact_info?.liked_count),
          comments: num(nc.interact_info?.comment_count),
          saves: num(nc.interact_info?.collected_count),
          user: nc.user?.nickname ?? nc.user?.nick_name ?? '',
          type: nc.type ?? 'normal',
        });
      }
    } catch {}
  });
};
ctx.on('page', hook);
for (const p of ctx.pages()) hook(p);

const page = ctx.pages()[0] ?? (await ctx.newPage());

for (const kw of KEYWORDS) {
  console.log(`▶ 搜索「${kw}」`);
  await page
    .goto(`https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(kw)}&type=general`, {
      waitUntil: 'domcontentloaded',
      timeout: 40000,
    })
    .catch(() => {});
  await page.waitForTimeout(7000);
  await page.mouse.wheel(0, 1600);
  await page.waitForTimeout(3000);
}

await ctx.close();

const notes = [...captured.values()].filter((n) => n.title && n.likes > 0);
console.log(`\n抓到 ${captured.size} 条，有效 ${notes.length} 条`);

if (!notes.length) {
  console.log('没抓到有效笔记——可能页面结构变了或触发风控。');
  process.exit(1);
}

const db = openDb();
const now = Date.now();

const upAcc = db.prepare(`
  INSERT INTO benchmark_account (id, platform, handle, follower_count, tier)
  VALUES (@id, 'xhs', @handle, 0, 'peer')
  ON CONFLICT(id) DO UPDATE SET handle = excluded.handle
`);
const upNote = db.prepare(`
  INSERT INTO benchmark_content
    (id, benchmark_account_id, platform, title, plays, likes, comments, saves, duration_sec, published_at, tags, first_seen_at)
  VALUES (@id, @accId, 'xhs', @title, 0, @likes, @comments, @saves, NULL, @publishedAt, @tags, @now)
  ON CONFLICT(id) DO UPDATE SET
    likes = excluded.likes,
    comments = excluded.comments,
    saves = excluded.saves
`);

let n = 0;
db.transaction(() => {
  for (const note of notes) {
    const accId = `bxhs_${(note.user || 'unknown').replace(/[^\w\u4e00-\u9fa5]/g, '').slice(0, 30)}`;
    upAcc.run({ id: accId, handle: `@${note.user || '未知'}` });
    upNote.run({
      id: `bcx_${note.id}`,
      accId,
      title: note.title.slice(0, 200),
      likes: note.likes,
      comments: note.comments,
      saves: note.saves,
      publishedAt: now,
      tags: note.type,
      now,
    });
    n += 1;
  }
})();

console.log(`\n入库：${n} 条小红书爆款（作者粉丝数拿不到，按点赞排序）`);
for (const note of [...notes].sort((a, b) => b.likes - a.likes).slice(0, 5)) {
  console.log(`  ${String(note.likes).padStart(7)} 赞  ${note.title.slice(0, 30)}  @${note.user}`);
}
process.exit(0);
