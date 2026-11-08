/**
 * LLM 复盘：把真实指标交给模型，让它说「为什么」和「下一步」。
 *
 * 和其他环节的分工：
 *   规则   → 哪条出事了（确定性、实时、免费）
 *   模型   → 为什么、接下来发什么
 *
 * 关键约束：所有产出都要过 scripts/lib/advice.mjs 的契约校验。
 * 不合格 → 带着失败原因打回重写 → 两次仍不合格 → 丢弃，不入库。
 * 宁可不给建议，也不给「建议提升完播率」这种废话。
 *
 * 用法：npm run analyze
 */
import { openDb } from './lib/ingest.mjs';
import { chat, parseJson, hasKey, MODEL } from './lib/llm.mjs';
import { validateAdvice, repairInstruction } from './lib/advice.mjs';

if (!hasKey()) {
  console.error('缺少 DEEPSEEK_API_KEY，检查 app/.env.local');
  process.exit(1);
}

const db = openDb();
const NOW = Date.now();

const account = db.prepare('SELECT * FROM account LIMIT 1').get();
if (!account) {
  console.error('库里没有账号，先跑 npm run collect');
  process.exit(1);
}

/* ---------- 取数 ---------- */

const contents = db
  .prepare('SELECT id, title, duration_sec, published_at FROM content ORDER BY published_at DESC')
  .all();

const latest = new Map();
for (const r of db
  .prepare(`SELECT entity_id, key, value FROM metric_point WHERE entity_type='content' ORDER BY captured_at ASC`)
  .all()) {
  const m = latest.get(r.entity_id) ?? {};
  m[r.key] = r.value;
  latest.set(r.entity_id, m);
}

const works = contents
  .map((c) => {
    const m = latest.get(c.id) ?? {};
    return {
      title: c.title,
      duration_sec: c.duration_sec,
      plays: m.plays != null ? Math.round(m.plays) : null,
      likes: m.likes != null ? Math.round(m.likes) : null,
      comments: m.comments != null ? Math.round(m.comments) : null,
      completion_pct: m.completion != null ? +(m.completion * 100).toFixed(2) : null,
      completion_5s_pct: m.completion_5s != null ? +(m.completion_5s * 100).toFixed(1) : null,
      avg_view_sec: m.avg_view_sec != null ? +m.avg_view_sec.toFixed(1) : null,
      bounce_2s_pct: m.bounce_2s != null ? +(m.bounce_2s * 100).toFixed(1) : null,
    };
  })
  .filter((w) => w.plays != null);

const trends = db
  .prepare(`SELECT word FROM trend WHERE captured_at >= ? ORDER BY rank ASC LIMIT 15`)
  .all(NOW - 24 * 3_600_000)
  .map((t) => t.word);

const peers = db
  .prepare(
    `SELECT c.title, c.duration_sec, c.tags, a.handle, a.follower_count, c.likes
       FROM benchmark_content c JOIN benchmark_account a ON a.id = c.benchmark_account_id
      WHERE a.follower_count >= 50 AND c.likes > 0
      ORDER BY (c.likes * 1.0 / a.follower_count) DESC LIMIT 12`,
  )
  .all()
  .map((p) => ({
    handle: p.handle,
    followers: p.follower_count,
    likes: p.likes,
    ratio: +(p.likes / p.follower_count).toFixed(1),
    duration_sec: p.duration_sec,
    tags: p.tags,
    title: p.title.slice(0, 50),
  }));

const va = db.prepare('SELECT * FROM video_analysis').all();
const avgOf = (rows, k) => (rows.length ? +(rows.reduce((a, b) => a + b[k], 0) / rows.length).toFixed(2) : null);
const mineVA = va.filter((r) => r.ref_type === 'content');
const peerVA = va.filter((r) => r.ref_type === 'benchmark');
const videoRhythm =
  mineVA.length && peerVA.length
    ? {
        mine: {
          avg_shot_sec: avgOf(mineVA, 'avg_shot_sec'),
          cuts_per_sec: avgOf(mineVA, 'cuts_per_sec'),
          first3s_cuts: avgOf(mineVA, 'first3s_cuts'),
          zero_cut_videos: mineVA.filter((r) => r.cuts === 0).length,
        },
        peer: {
          avg_shot_sec: avgOf(peerVA, 'avg_shot_sec'),
          cuts_per_sec: avgOf(peerVA, 'cuts_per_sec'),
          first3s_cuts: avgOf(peerVA, 'first3s_cuts'),
        },
      }
    : null;

const fans7d = db
  .prepare(
    `SELECT COALESCE(SUM(value),0) v FROM metric_point
      WHERE entity_type='account' AND key='fans_gain' AND captured_at >= ?`,
  )
  .get(NOW - 7 * 86_400_000).v;

const payload = {
  account: { handle: account.handle, followers: account.follower_count, new_followers_7d: fans7d },
  works,
  peer_viral: peers,
  hot_topics: trends,
  video_rhythm: videoRhythm,
};

/* ---------- prompt ---------- */

const SYSTEM = `你是抖音内容策略顾问。根据提供的作品内容和数据判断创作方向，不要假定创作者的赛道。

铁律（会被程序校验，不合格直接打回）：
1. 每条建议必须有 evidence 数组，至少一条，格式 {"label":"指标名","mine":"我的真实值","peer":"同行基准值"}，数字必须来自我给的数据
2. action 必须能直接执行：写到第几句、第几秒、换什么镜头、标题怎么改。禁止「优化」「提升」「加强」「丰富」这类没有对象的动词
3. rationale 必须说清差距在哪，引用具体数字
4. 没数据支撑的维度不写；不假定因果，不把系统阈值写成同行统计，推测要标明假设。`;

const USER = `数据：

${JSON.stringify(payload, null, 1)}

只输出 JSON：
{
  "diagnosis": {
    "title": "一句话概括账号最大的结构性问题",
    "rationale": "问题说明，引用数字",
    "action": "一条能立刻执行的动作",
    "evidence": [{"label":"2秒跳出率","mine":"63.5%","peer":"<40%"}]
  },
  "worst_work": {
    "title": "作品标题",
    "rationale": "这条为什么最差，引用数字",
    "action": "具体到第几句/第几秒/什么镜头",
    "evidence": [{"label":"2秒跳出率","mine":"63.5%","peer":"<40%"}]
  },
  "best_work_bet": {
    "title": "最值得复用的作品",
    "rationale": "为什么它跑赢了，引用数字",
    "action": "下一步怎么复用它的结构",
    "evidence": [{"label":"5秒完播","mine":"41.3%","peer":"25%"}]
  },
  "topics": [
    {
      "title": "选题标题",
      "angle": "切入角度",
      "structure": "开头3秒怎么说、中间怎么切、结尾怎么收",
      "basis": "踩的哪个信号，含具体数字或热榜词",
      "evidence": [{"label":"依据","mine":"2607 播放 / 2秒跳出 31.8%","peer":"热榜#立冬吃什么"}]
    }
  ]
}
topics 给 3 条。`;

/* ---------- 带契约的调用 ---------- */

function collectErrors(out) {
  const units = [];
  if (out.diagnosis) units.push(['diagnosis', out.diagnosis, out.diagnosis.title]);
  if (out.worst_work) units.push(['worst_work', out.worst_work, out.worst_work.title]);
  if (out.best_work_bet) units.push(['best_work_bet', out.best_work_bet, out.best_work_bet.title]);
  for (const [i, t] of (out.topics ?? []).entries()) {
    units.push([
      `topics[${i}]`,
      { rationale: [t.angle, t.basis].filter(Boolean).join('；'), action: t.structure, evidence: t.evidence },
      t.title,
    ]);
  }

  const errors = [];
  for (const [name, unit, label] of units) {
    const e = validateAdvice(unit);
    if (e.length) errors.push(`${name}${label ? `（${label}）` : ''}: ${e.join('；')}`);
  }
  if (!units.length) errors.push('输出里没有任何建议单元');
  return errors;
}

let out = null;
let errors = [];
let attempts = 0;

for (attempts = 1; attempts <= 3; attempts++) {
  const messages = [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: USER },
  ];
  if (attempts > 1) {
    messages.push({ role: 'assistant', content: JSON.stringify(out) });
    messages.push({ role: 'user', content: repairInstruction(errors, out) });
  }

  console.log(`第 ${attempts} 次调用 ${MODEL}…`);
  const { content, usage } = await chat(messages, { json: true, temperature: 0.4, maxTokens: 1800 });
  try {
    out = parseJson(content);
  } catch {
    errors = ['返回不是合法 JSON'];
    console.log('  ✗ 不是合法 JSON');
    continue;
  }
  errors = collectErrors(out);
  console.log(`  用量 ${usage.total_tokens} tokens，${errors.length ? `不合格 ${errors.length} 处` : '通过校验'}`);
  if (!errors.length) break;
  for (const e of errors) console.log(`    - ${e.slice(0, 120)}`);
}

if (!out || errors.length) {
  console.log('\n连续 3 次没通过契约校验，这次不出建议。宁可不给，也不给废话。');
  process.exit(0);
}

/* ---------- 打印 ---------- */

const fmtEvidence = (ev) =>
  (ev ?? []).map((e) => `${e.label}：我 ${e.mine} / 同行 ${e.peer}`).join('　');

console.log('\n【账号诊断】' + out.diagnosis.title);
console.log(out.diagnosis.rationale);
console.log(`证据：${fmtEvidence(out.diagnosis.evidence)}`);
console.log(`动作：${out.diagnosis.action}\n`);

if (out.worst_work) {
  console.log(`【最该改】${out.worst_work.title}`);
  console.log(out.worst_work.rationale);
  console.log(`证据：${fmtEvidence(out.worst_work.evidence)}`);
  console.log(`动作：${out.worst_work.action}\n`);
}

console.log('【下一条拍什么】');
for (const t of out.topics ?? []) {
  console.log(`  · ${t.title}`);
  console.log(`    依据：${t.basis ?? '—'}`);
  console.log(`    结构：${t.structure}`);
}

/* ---------- 落库 ---------- */

const ins = db.prepare(`
  INSERT OR REPLACE INTO suggestion
    (id, workspace_id, scope, target_id, source, rule_id, severity, tag, title, rationale, action, evidence, confidence, status, created_at)
  VALUES (@id,'default',@scope,@targetId,'llm',@ruleId,@severity,@tag,@title,@rationale,@action,@evidence,@confidence,'new',@createdAt)
`);

const day = new Date(NOW).toISOString().slice(0, 10);
const rows = [
  {
    id: `sg_llm_diag_${day}`,
    scope: 'account',
    targetId: null,
    ruleId: 'llm_diagnosis',
    severity: 'amber',
    tag: '模型诊断',
    title: out.diagnosis.title,
    rationale: out.diagnosis.rationale,
    action: out.diagnosis.action,
    evidence: JSON.stringify(out.diagnosis.evidence ?? []),
    confidence: 0.75,
  },
];
if (out.worst_work) {
  rows.push({
    id: `sg_llm_worst_${day}`,
    scope: 'content',
    targetId: null,
    ruleId: 'llm_worst',
    severity: 'red',
    tag: '最该改',
    title: out.worst_work.title,
    rationale: out.worst_work.rationale,
    action: out.worst_work.action,
    evidence: JSON.stringify(out.worst_work.evidence ?? []),
    confidence: 0.72,
  });
}
if (out.topics?.length) {
  rows.push({
    id: `sg_llm_topics_${day}`,
    scope: 'account',
    targetId: null,
    ruleId: 'llm_topics',
    severity: 'green',
    tag: '选题建议',
    title: `下一条拍什么：${out.topics[0].title}`,
    rationale: out.topics.map((t, i) => `${i + 1}. ${t.title}｜${t.angle}`).join('\n'),
    action: out.topics[0].structure,
    evidence: JSON.stringify(out.topics[0].evidence ?? []),
    confidence: 0.7,
  });
}

for (const r of rows) ins.run({ ...r, createdAt: NOW });

const hash = (str) => {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return h.toString(36);
};
const insTopic = db.prepare(`
  INSERT OR IGNORE INTO topic (id, workspace_id, title, angle, structure, source, note, status, created_at)
  VALUES (@id,'default',@title,@angle,@structure,'llm',@note,'idea',@createdAt)
`);
let topicCount = 0;
for (const t of out.topics ?? []) {
  if (!t?.title) continue;
  const r = insTopic.run({
    id: `tp_llm_${hash(t.title)}`,
    title: t.title,
    angle: t.angle ?? null,
    structure: t.structure ?? null,
    note: t.basis ?? null,
    createdAt: NOW,
  });
  topicCount += r.changes;
}

console.log(`\n已写入 ${rows.length} 条建议（全部通过契约校验），新增选题 ${topicCount} 条。`);
process.exit(0);
