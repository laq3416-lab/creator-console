/**
 * 视频结构分析：把「动效差不差」变成可以对比的数字。
 *
 * 分析两组：
 *   · 我自己的作品
 *   · 同赛道赞粉比最高的爆款
 * 指标：镜头切换频率、平均镜头时长、前 3 秒切了几刀。
 *
 * 下载完立刻删文件，只留指标——视频本体没有保留价值，而且占空间。
 *
 * 用法：npm run video
 */
import { openDb } from './lib/ingest.mjs';
import { hasFfmpeg, analyzeUrl } from './lib/video.mjs';

const MY_LIMIT = Number(process.env.VIDEO_MY ?? 8);
const PEER_LIMIT = Number(process.env.VIDEO_PEER ?? 6);

if (!(await hasFfmpeg())) {
  console.error('没有 ffmpeg，跳过视频分析。安装：brew install ffmpeg');
  process.exit(0);
}

const db = openDb();
const cols = db.prepare('PRAGMA table_info(benchmark_content)').all().map((c) => c.name);
if (!cols.includes('video_url')) db.exec('ALTER TABLE benchmark_content ADD COLUMN video_url TEXT');
const ccols = db.prepare('PRAGMA table_info(content)').all().map((c) => c.name);
if (!ccols.includes('video_url')) db.exec('ALTER TABLE content ADD COLUMN video_url TEXT');

const done = new Set(
  db.prepare("SELECT ref_type || ':' || ref_id AS k FROM video_analysis").all().map((r) => r.k),
);

const mine = db
  .prepare(
    `SELECT id, title, video_url FROM content
      WHERE video_url IS NOT NULL AND video_url != ''
      ORDER BY published_at DESC LIMIT ?`,
  )
  .all(MY_LIMIT)
  .filter((r) => !done.has(`content:${r.id}`));

const peers = db
  .prepare(
    `SELECT c.id, c.title, c.video_url, c.likes, a.follower_count, a.handle
       FROM benchmark_content c JOIN benchmark_account a ON a.id = c.benchmark_account_id
      WHERE c.video_url IS NOT NULL AND c.video_url != '' AND c.likes > 0 AND a.follower_count >= 100
      ORDER BY (c.likes * 1.0 / a.follower_count) DESC LIMIT 60`,
  )
  .all()
  .filter((r) => !done.has(`benchmark:${r.id}`))
  .slice(0, PEER_LIMIT);

const ins = db.prepare(`
  INSERT OR REPLACE INTO video_analysis
    (ref_type, ref_id, duration_sec, cuts, cuts_per_sec, avg_shot_sec, first3s_cuts, analyzed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
`);

async function run(list, refType, label) {
  let ok = 0;
  for (const [i, r] of list.entries()) {
    const tag = `[${i + 1}/${list.length}] ${r.title.slice(0, 18)}`;
    try {
      const a = await analyzeUrl(r.video_url, `${refType}_${r.id}`);
      ins.run(refType, r.id, a.durationSec, a.cuts, a.cutsPerSec, a.avgShotSec, a.first3sCuts, Date.now());
      ok += 1;
      console.log(`  ✓ ${tag} → ${a.durationSec}s / ${a.cuts} 刀 / ${a.cutsPerSec.toFixed(2)} 刀每秒 / 前3秒 ${a.first3sCuts} 刀`);
    } catch (e) {
      console.log(`  ✗ ${tag} → ${e.message.split('\n')[0].slice(0, 60)}`);
    }
  }
  console.log(`${label}：成功 ${ok}/${list.length}`);
  return ok;
}

console.log(`分析自己 ${mine.length} 条 / 同行 ${peers.length} 条`);
if (mine.length) await run(mine, 'content', '我的作品');
if (peers.length) await run(peers, 'benchmark', '同行爆款');

/* 对比 */
const avg = (rows, k) => (rows.length ? rows.reduce((s, r) => s + r[k], 0) / rows.length : null);
const myRows = db.prepare(`SELECT * FROM video_analysis WHERE ref_type='content'`).all();
const peerRows = db.prepare(`SELECT * FROM video_analysis WHERE ref_type='benchmark'`).all();

const m = {
  cutsPerSec: avg(myRows, 'cuts_per_sec'),
  avgShotSec: avg(myRows, 'avg_shot_sec'),
  first3s: avg(myRows, 'first3s_cuts'),
};
const p = {
  cutsPerSec: avg(peerRows, 'cuts_per_sec'),
  avgShotSec: avg(peerRows, 'avg_shot_sec'),
  first3s: avg(peerRows, 'first3s_cuts'),
};

console.log('\n镜头节奏对比：');
const fmt = (v, d = 2) => (v == null ? '—' : v.toFixed(d));
console.log(`  镜头切换   我 ${fmt(m.cutsPerSec)} 刀/秒   同行 ${fmt(p.cutsPerSec)} 刀/秒`);
console.log(`  平均镜头   我 ${fmt(m.avgShotSec, 1)} 秒      同行 ${fmt(p.avgShotSec, 1)} 秒`);
console.log(`  前3秒切换  我 ${fmt(m.first3s, 1)} 刀      同行 ${fmt(p.first3s, 1)} 刀`);

/* 把差距变成建议：同行也未必多刀，但你的镜头长度是它们的 6 倍，这是能改的 */
if (m.cutsPerSec != null && p.cutsPerSec != null && m.cutsPerSec < p.cutsPerSec * 0.7) {
  const staticOnes = db
    .prepare(`SELECT va.*, c.title FROM video_analysis va JOIN content c ON c.id = va.ref_id
               WHERE va.ref_type='content' AND va.cuts = 0`)
    .all();
  const insSugg = db.prepare(`
    INSERT OR REPLACE INTO suggestion
      (id, workspace_id, scope, target_id, source, rule_id, severity, tag, title, rationale, action, confidence, status, created_at)
    VALUES ('sg_video_rhythm','default','account',NULL,'rule','r_video_rhythm','amber','节奏',
      ?, ?, ?, 0.85, 'new', ?)
  `);
  const detail = staticOnes.length
    ? `其中 ${staticOnes.length} 条全程一个镜头没切：${staticOnes.map((x) => `《${x.title.slice(0, 12)}》`).join('、')}。`
    : '';
  insSugg.run(
    `平均镜头 ${m.avgShotSec?.toFixed(0)} 秒，比同行慢 ${(m.avgShotSec / p.avgShotSec).toFixed(1)} 倍`,
    `你的平均镜头 ${m.avgShotSec?.toFixed(0)} 秒，同行爆款 ${p.avgShotSec?.toFixed(0)} 秒；每秒切镜 ${m.cutsPerSec.toFixed(2)} 刀 vs 同行 ${p.cutsPerSec.toFixed(2)} 刀。前 3 秒你切了 ${m.first3s?.toFixed(1)} 刀，同行 ${p.first3s?.toFixed(1)} 刀。${detail}`,
    '同一句话用两个画面拍，每 8-10 秒换一次景别或机位；开头 3 秒至少给一次画面变化',
    Date.now(),
  );
  console.log('\n已生成节奏建议（镜头长度差距过大）');
}

process.exit(0);
