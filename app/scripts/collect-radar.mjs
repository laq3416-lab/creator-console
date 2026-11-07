/**
 * 爆款雷达采集（管道 B：公开页）
 *
 * 做法和管道 A 一样：不构造请求、不逆向签名，
 * 只让页面自己去搜，我们把回来 的 JSON 收下来。
 *
 * 用法：
 *   node scripts/collect-radar.mjs              抓取 + 入库
 *   RADAR_PARSE_ONLY=1 node scripts/collect-radar.mjs   只用上次录制的结果重新解析
 */
import fs from 'node:fs';
import path from 'node:path';
import { launch } from './lib/browser.mjs';
import { openDb } from './lib/ingest.mjs';
import { dir } from './lib/paths.mjs';

const KEYWORDS = ['AI工具', 'AI Agent', 'vibe coding', 'AI编程', 'AI学习'];
const OUT = dir('radar');
const RAW = path.join(OUT, 'raw');
const PARSE_ONLY = process.env.RADAR_PARSE_ONLY === '1';
const DAY = 86_400_000;

/* ---------- 阶段一：抓 ---------- */

async function capture() {
  fs.mkdirSync(RAW, { recursive: true });
  const { ctx } = await launch({ headless: false });
  const saved = [];

  ctx.on('page', (p) => hook(p));
  for (const p of ctx.pages()) hook(p);

  const trends = [];
  function hook(page) {
    page.on('response', async (res) => {
      const u = res.url();
      // 热榜是选题的外部信号，顺路收下来
      if (/web\/hot\/search\/list/.test(u)) {
        try {
          const b = await res.json();
          const list = b?.data?.word_list ?? b?.data?.data ?? b?.word_list ?? [];
          for (const [i, w] of list.entries()) {
            if (w?.word) trends.push({ word: w.word, hot: Number(w.hot_value) || 0, rank: i + 1 });
          }
        } catch {}
        return;
      }
      // 带 ?type=video 会走另一个接口且返回空，所以走通用搜索
      if (!/general\/search\/single|web\/search\/item/.test(u)) return;
      try {
        const body = await res.json();
        if (!body?.data?.length) return;
        const kw = decodeURIComponent(new URL(u).searchParams.get('keyword') || 'unknown');
        const file = `${slug(kw)}-${Date.now()}.json`;
        fs.writeFileSync(path.join(RAW, file), JSON.stringify(body));
        saved.push({ kw, file, n: body.data.length });
        console.log(`  + ${kw} → ${body.data.length} 条`);
      } catch {}
    });
  }

  const page = ctx.pages()[0] ?? (await ctx.newPage());
  for (const kw of KEYWORDS) {
    console.log(`▶ 搜索「${kw}」`);
    await page
      .goto(`https://www.douyin.com/search/${encodeURIComponent(kw)}?type=video`, {
        waitUntil: 'domcontentloaded',
        timeout: 40000,
      })
      .catch(() => {});
    await page.waitForTimeout(6000);
    await page.mouse.wheel(0, 1800);
    await page.waitForTimeout(2500);
  }

  await ctx.close();
  console.log(`\n录到 ${saved.length} 份搜索结果`);
  if (trends.length) {
    const uniq = new Map();
    for (const t of trends) if (!uniq.has(t.word)) uniq.set(t.word, t);
    trends.length = 0;
    trends.push(...[...uniq.values()].sort((a, b) => a.rank - b.rank).slice(0, 50));
  }
  return { saved, trends };
}

/* ---------- 阶段二：解析 ---------- */

const slug = (s) => s.replace(/[^\w\u4e00-\u9fa5]/g, '').slice(0, 20);

function pickAweme(item) {
  // 搜索结果有两种形态：直接是 aweme，或包在 aweme_info 里
  return item.aweme_info ?? item.aweme ?? item;
}

function hashtags(desc) {
  return [...String(desc).matchAll(/#([^\s#]{2,20})/g)].map((m) => m[1]).slice(0, 4);
}

function parseAll() {
  const files = fs.existsSync(RAW) ? fs.readdirSync(RAW).filter((f) => f.endsWith('.json')) : [];
  const accounts = new Map();
  const contents = new Map();

  for (const f of files) {
    const body = JSON.parse(fs.readFileSync(path.join(RAW, f), 'utf8'));
    for (const item of body.data ?? []) {
      const a = pickAweme(item);
      const st = a.statistics ?? {};
      const au = a.author ?? {};
      const awemeId = a.aweme_id ?? a.awemeId;
      if (!awemeId || !au.nickname) continue;

      const secUid = au.sec_uid ?? au.secUid ?? au.unique_id ?? au.nickname;
      const accId = `bd_${slug(String(secUid))}`;
      const fans = au.follower_count ?? 0;

      accounts.set(accId, {
        id: accId,
        platform: 'douyin',
        handle: `@${au.nickname}`,
        followerCount: fans,
        tier: fans >= 500_000 ? 'head' : fans >= 1_000 ? 'peer' : 'small',
      });

      const plays = st.play_count ?? 0;
      contents.set(String(awemeId), {
        id: `bc_${awemeId}`,
        benchmarkAccountId: accId,
        platform: 'douyin',
        title: (a.desc ?? '').split('\n')[0].slice(0, 200) || '（无标题）',
        plays,
        likes: st.digg_count ?? 0,
        comments: st.comment_count ?? 0,
        saves: st.collect_count ?? 0,
        durationSec: a.duration ? Math.round(a.duration / 1000) : null,
        publishedAt: (a.create_time ?? 0) * 1000,
        tags: hashtags(a.desc ?? '').join(','),
        videoUrl: a.video?.play_addr?.url_list?.[0] ?? null,
      });
    }
  }

  return { accounts: [...accounts.values()], contents: [...contents.values()] };
}

/* ---------- 阶段三：入库 ---------- */

function save({ accounts, contents }) {
  const db = openDb();
  const cols = db.prepare('PRAGMA table_info(benchmark_content)').all().map((c) => c.name);
  if (!cols.includes('first_seen_at')) db.exec('ALTER TABLE benchmark_content ADD COLUMN first_seen_at INTEGER');
  const now = Date.now();
  const upAcc = db.prepare(`
    INSERT INTO benchmark_account (id, platform, handle, follower_count, tier)
    VALUES (@id,@platform,@handle,@followerCount,@tier)
    ON CONFLICT(id) DO UPDATE SET
      follower_count = excluded.follower_count,
      handle = excluded.handle,
      tier = excluded.tier
  `);
  const upC = db.prepare(`
    INSERT INTO benchmark_content
      (id, benchmark_account_id, platform, title, plays, likes, comments, saves, duration_sec, published_at, tags, first_seen_at, video_url)
    VALUES (@id,@benchmarkAccountId,@platform,@title,@plays,@likes,@comments,@saves,@durationSec,@publishedAt,@tags,@now,@videoUrl)
    ON CONFLICT(id) DO UPDATE SET
      plays = excluded.plays,
      likes = excluded.likes,
      comments = excluded.comments,
      saves = excluded.saves,
      video_url = COALESCE(excluded.video_url, benchmark_content.video_url)
  `);

  db.transaction(() => {
    for (const a of accounts) upAcc.run(a);
    for (const c of contents) upC.run({ ...c, now, videoUrl: c.videoUrl ?? null });
  })();

  if (capturedTrends.length) {
    const insTrend = db.prepare(
      `INSERT OR IGNORE INTO trend (source, word, hot_value, rank, captured_at) VALUES ('douyin_hot', ?, ?, ?, ?)`,
    );
    const at = Date.now();
    for (const t of capturedTrends) insTrend.run(t.word, t.hot, t.rank, at);
    console.log(`热榜入库 ${capturedTrends.length} 条（前 3：${capturedTrends.slice(0, 3).map((t) => t.word).join(' / ')}）`);
  }

  const stat = db
    .prepare(
      `SELECT COUNT(*) n, SUM(CASE WHEN plays > 0 THEN 1 ELSE 0 END) withPlays FROM benchmark_content`,
    )
    .get();
  console.log(`\n入库：对标账号 ${accounts.length} 个，爆款 ${contents.length} 条（有播放数 ${stat.withPlays} 条）`);

  /* 新冒出来的爆款 → 变成一条建议，这是「持续监控」的关键：
     不是每次跑完给你一份报告，而是有新东西才提醒 */
  const NEW_RATIO = 5; // 赞粉比 5 倍以上才算值得看
  const pool = db
    .prepare(
      `SELECT c.id, c.title, c.likes, c.comments, c.duration_sec, c.tags,
              a.handle, a.follower_count
         FROM benchmark_content c JOIN benchmark_account a ON a.id = c.benchmark_account_id
        WHERE c.first_seen_at >= ? AND c.likes > 0 AND a.follower_count >= 50
        ORDER BY (c.likes * 1.0 / a.follower_count) DESC LIMIT 40`,
    )
    .all(now - 3_600_000);

  // 同一账号只留最好的一条：5 条提醒来自 2 个号是噪声
  const byAuthor = new Map();
  for (const f of pool) {
    const ratio = f.likes / f.follower_count;
    if (ratio < NEW_RATIO) continue;
    if (!byAuthor.has(f.handle)) byAuthor.set(f.handle, { ...f, ratio });
  }
  const fresh = [...byAuthor.values()].slice(0, 3);

  const insSugg = db.prepare(`
    INSERT OR IGNORE INTO suggestion
      (id, workspace_id, scope, target_id, source, rule_id, severity, tag, title, rationale, action, confidence, status, created_at)
    VALUES (?, 'default', 'account', NULL, 'radar', 'radar_new_viral', 'green', '新爆款', ?, ?, ?, 0.8, 'new', ?)
  `);

  let freshCount = 0;
  for (const f of fresh) {
    const tags = (f.tags ?? '').split(',').filter(Boolean).slice(0, 3).join(' / ');
    const extra =
      f.ratio > 100
        ? '这个倍数已经超出正常结构能解释的范围，多半是算法给了一次大推，先看选题不看结构。'
        : '拆它的开头和节奏，别抄文案。';
    const action =
      f.ratio > 100
        ? '看它选题踩了什么正在起势的话题'
        : `看前 3 秒说了什么${f.duration_sec ? `、${f.duration_sec} 秒怎么排的` : ''}`;

    const r = insSugg.run(
      `sg_radar_${f.id}`,
      `${f.handle}（${f.follower_count} 粉）拿到 ${f.likes} 赞 · 赞粉比 ${f.ratio.toFixed(1)}×`,
      [
        f.duration_sec ? `${f.duration_sec} 秒` : null,
        f.comments ? `评论 ${f.comments}` : null,
        tags ? `话题：${tags}` : null,
      ]
        .filter(Boolean)
        .join(' · ') + `。${extra}`,
      action,
      now,
    );
    freshCount += r.changes;
  }
  if (freshCount) console.log(`\n发现新爆款 ${freshCount} 条，已生成建议`);

  const top = db
    .prepare(
      `SELECT c.title, c.likes, a.follower_count, a.handle
         FROM benchmark_content c JOIN benchmark_account a ON a.id = c.benchmark_account_id
        WHERE c.likes > 0 AND a.follower_count > 0
        ORDER BY (c.likes * 1.0 / a.follower_count) DESC LIMIT 5`,
    )
    .all();
  console.log('\n赞粉比前 5：');
  for (const t of top)
    console.log(
      `  ${(t.likes / t.follower_count).toFixed(1)}×  ${t.handle} ${t.follower_count}粉  ${t.title.slice(0, 30)}`,
    );
}

/* ---------- 主流程 ---------- */

let capturedTrends = [];
if (!PARSE_ONLY) {
  const r = await capture();
  capturedTrends = r.trends ?? [];
}
const parsed = parseAll();
if (!parsed.contents.length) {
  console.log('没解析出任何作品。先看 data/radar/raw 里的结构有没有变。');
  process.exit(1);
}
save(parsed);
process.exit(0);
