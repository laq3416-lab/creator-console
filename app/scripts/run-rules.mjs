/**
 * 规则引擎：把指标变成判断。
 *
 * 设计原则：
 * 1. 阈值全在 rule 表里，代码不写死
 * 2. 样本不够不下结论（播放 < 100 的作品不参与统计）
 * 3. 同样的规则对同一条内容，12 小时内只出一条，避免刷屏
 * 4. 每条建议都带证据，说不清为什么不出
 *
 * 用法：npm run rules
 */
import { openDb } from './lib/ingest.mjs';
import { isVague } from './lib/advice.mjs';

const db = openDb();
const NOW = Date.now();
const DAY = 86_400_000;
const MIN_SAMPLE = 100; // 低于这个播放数一律不判断

/* ---------- 迁移与初始规则 ---------- */

const cols = db.prepare('PRAGMA table_info(suggestion)').all().map((c) => c.name);
if (!cols.includes('rule_id')) db.exec('ALTER TABLE suggestion ADD COLUMN rule_id TEXT');

const DEFAULT_RULES = [
  {
    id: 'r_completion_agg',
    name: '完播率整体偏低',
    scope: 'content_agg',
    metric_key: 'completion',
    op: 'lt',
    threshold: 0.2,
    severity: 'red',
    title: '你最近的作品完播率普遍偏低',
    action: '缩短时长，前 3 秒直接给结果',
    max_items: 1,
  },
  {
    id: 'r_bounce_agg',
    name: '2 秒跳出率过高',
    scope: 'content_agg',
    metric_key: 'bounce_2s',
    op: 'gt',
    threshold: 0.45,
    severity: 'amber',
    title: '开头 2 秒流失严重',
    action: '把结论提到第一句，删掉铺垫',
    max_items: 1,
  },
  {
    id: 'r_hold',
    name: '平均播放占比过低',
    scope: 'content_agg',
    metric_key: 'hold_ratio',
    op: 'lt',
    threshold: 0.15,
    severity: 'amber',
    title: '观众平均只看了很少一段',
    action: '检查节奏：每 5 秒要有一次信息更新',
    max_items: 1,
  },
  {
    id: 'r_hit',
    name: '出现爆款苗头',
    scope: 'account',
    metric_key: 'top_plays_ratio',
    op: 'gt',
    threshold: 3,
    severity: 'green',
    title: '有一条明显跑赢其他作品',
    action: '48 小时内追发同结构续集',
    max_items: 1,
  },
  {
    id: 'r_fans_stall',
    name: '涨粉停滞',
    scope: 'account',
    metric_key: 'fans_gain_7d',
    op: 'lte',
    threshold: 0,
    severity: 'amber',
    title: '最近 7 天没有涨粉',
    action: '结尾加一句明确提问，先把评论拉起来',
    max_items: 1,
  },
  {
    id: 'r_freshness',
    name: '数据陈旧',
    scope: 'data',
    metric_key: 'hours_since_sync',
    op: 'gt',
    threshold: 24,
    severity: 'red',
    title: '数据超过一天没更新了',
    action: '跑一次 npm run collect',
    max_items: 1,
  },
];

const insRule = db.prepare(`
  INSERT OR IGNORE INTO rule (id,name,scope,metric_key,op,threshold,severity,title,action,max_items,enabled)
  VALUES (@id,@name,@scope,@metric_key,@op,@threshold,@severity,@title,@action,@max_items,1)
`);
for (const r of DEFAULT_RULES) insRule.run(r);

const rules = db.prepare('SELECT * FROM rule WHERE enabled = 1').all();

/* ---------- 取数 ---------- */

const contents = db
  .prepare(
    `SELECT c.id, c.title, c.duration_sec, c.published_at, a.handle
       FROM content c JOIN account a ON a.id = c.account_id
      ORDER BY c.published_at DESC`,
  )
  .all();

// 每条内容每个指标只留最新值
const latest = new Map();
for (const row of db
  .prepare(`SELECT entity_id, key, value FROM metric_point WHERE entity_type='content' ORDER BY captured_at ASC`)
  .all()) {
  const m = latest.get(row.entity_id) ?? {};
  m[row.key] = row.value;
  latest.set(row.entity_id, m);
}

const enriched = contents.map((c) => {
  const m = latest.get(c.id) ?? {};
  const hold = c.duration_sec && m.avg_view_sec ? m.avg_view_sec / c.duration_sec : null;
  return { ...c, m: { ...m, hold_ratio: hold } };
});

const eligible = enriched.filter((c) => (c.m.plays ?? 0) >= MIN_SAMPLE);

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function accountMetric(key) {
  if (key === 'fans_gain_7d') {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(value),0) v FROM metric_point
          WHERE entity_type='account' AND key='fans_gain' AND captured_at >= ?`,
      )
      .get(NOW - 7 * DAY);
    return { value: row.v, sample: 7 };
  }
  if (key === 'top_plays_ratio') {
    const plays = eligible.map((c) => c.m.plays).filter(Number.isFinite);
    const med = median(plays);
    if (!med) return { value: null };
    const top = Math.max(...plays);
    return { value: top / med, top, med };
  }
  if (key === 'hours_since_sync') {
    const row = db.prepare('SELECT MAX(last_synced_at) t FROM account').get();
    if (!row?.t) return { value: null };
    return { value: (NOW - row.t) / 3_600_000 };
  }
  return { value: null };
}

/* ---------- 判定 ---------- */

const cmp = {
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
  eq: (a, b) => a === b,
};

const pct = (v) => `${(v * 100).toFixed(1)}%`;
const results = [];

function push(rule, targetId, title, rationale, action, evidence, confidence) {
  // 规则也要守契约：动作是空话就不出
  if (isVague(action)) return;
  results.push({ rule, targetId, title, rationale, action, evidence, confidence });
}

for (const rule of rules) {
  const ok = cmp[rule.op];
  if (!ok) continue;

  if (rule.scope === 'data') {
    const { value } = accountMetric(rule.metric_key);
    if (value == null || !ok(value, rule.threshold)) continue;
    push(
      rule,
      null,
      rule.title,
      `最近一次同步在 ${value.toFixed(1)} 小时前，超过阈值 ${rule.threshold} 小时。看到的是旧数据。`,
      rule.action,
      [{ label: '数据时间', mine: `${value.toFixed(1)} 小时`, peer: `${rule.threshold} 小时（系统阈值）` }],
      0.95,
    );
    continue;
  }

  if (rule.scope === 'account') {
    const meta = accountMetric(rule.metric_key);
    if (meta.value == null || !ok(meta.value, rule.threshold)) continue;

    if (rule.metric_key === 'fans_gain_7d') {
      push(
        rule,
        null,
        rule.title,
        `近 7 天涨粉合计 ${meta.value} 人。可以结合作品内容检查关注引导；仅凭这个指标不能确定原因。`,
        '结尾最后一句换成「这个系列我每周更一条，关注了才不会漏」，不要只说点赞关注',
        [{ label: '近 7 日涨粉', mine: `${meta.value} 人`, peer: '> 0' }],
        0.8,
      );
    } else if (rule.metric_key === 'top_plays_ratio') {
      push(
        rule,
        null,
        rule.title,
        `最高播放 ${Math.round(meta.top)}，账号中位 ${Math.round(meta.med)}，是 ${meta.value.toFixed(1)} 倍。这条值得进一步复盘；播放差异不能单独证明结构是原因。`,
        '把这条的开头 3 秒逐字写下来，下一条换题材但套同一个开头句式',
        [
          { label: '最高播放', mine: String(Math.round(meta.top)), peer: `中位 ${Math.round(meta.med)}` },
          { label: '倍数', mine: `${meta.value.toFixed(1)}×`, peer: '> 3×' },
        ],
        0.85,
      );
    }
    continue;
  }

  if (rule.scope === 'content_agg') {
    const vals = eligible.map((c) => c.m[rule.metric_key]).filter((v) => Number.isFinite(v));
    if (vals.length < 2) continue; // 少于两条不下结论
    const med = median(vals);
    if (!ok(med, rule.threshold)) continue;

    const fmt = rule.metric_key === 'hold_ratio' ? pct : pct;
    const concreteAction =
      rule.metric_key === 'completion'
        ? '把每条前 3 秒的台词重写：第一句直接给结论或数字，删掉「大家好」这类铺垫'
        : rule.metric_key === 'bounce_2s'
          ? '第 0 秒就放最反常识的那一帧画面，第 1 秒才开口说话'
          : '每 10 秒插入一次画面变化：换景别、换机位或加字幕卡';
    push(
      rule,
      null,
      rule.title,
      `${vals.length} 条样本的中位数是 ${fmt(med)}；当前提示阈值 ${fmt(rule.threshold)} 为系统预设，不代表实测同行基准。`,
      concreteAction,
      [{ label: rule.name, mine: fmt(med), peer: fmt(rule.threshold) }],
      0.75,
    );
    continue;
  }

  if (rule.scope === 'content') {
    const hits = eligible
      .filter((c) => Number.isFinite(c.m[rule.metric_key]) && ok(c.m[rule.metric_key], rule.threshold))
      .sort((a, b) => (a.m[rule.metric_key] ?? 0) - (b.m[rule.metric_key] ?? 0))
      .slice(0, rule.max_items);

    for (const c of hits) {
      push(
        rule,
        c.id,
        `${c.title.slice(0, 24)} — ${rule.name}`,
        `${rule.metric_key} 为 ${pct(c.m[rule.metric_key])}，低于阈值 ${pct(rule.threshold)}（播放 ${Math.round(c.m.plays)}）。`,
        rule.action,
        [{ label: rule.name, mine: pct(c.m[rule.metric_key]), peer: pct(rule.threshold) }],
        0.7,
      );
    }
  }
}

/* ---------- 写库（去重） ---------- */

const exists = db.prepare(`
  SELECT 1 FROM suggestion
   WHERE rule_id = ? AND COALESCE(target_id,'') = COALESCE(?,'') AND created_at > ?
`);
const ins = db.prepare(`
  INSERT INTO suggestion (id, workspace_id, scope, target_id, source, rule_id, severity, tag, title, rationale, action, evidence, confidence, status, created_at)
  VALUES (@id,'default',@scope,@targetId,'rule',@ruleId,@severity,@tag,@title,@rationale,@action,@evidence,@confidence,'new',@createdAt)
`);

let written = 0;
let skipped = 0;
for (const r of results) {
  if (exists.get(r.rule.id, r.targetId, NOW - 12 * 3_600_000)) {
    skipped += 1;
    continue;
  }
  ins.run({
    id: `sg_${r.rule.id}_${r.targetId ?? 'account'}_${new Date(NOW).toISOString().slice(0, 10)}`,
    scope: r.targetId ? 'content' : 'account',
    targetId: r.targetId,
    ruleId: r.rule.id,
    severity: r.rule.severity,
    tag: r.rule.severity === 'red' ? '高危' : r.rule.severity === 'green' ? '机会' : '待处理',
    title: r.title,
    rationale: r.rationale,
    action: r.action,
    evidence: JSON.stringify(r.evidence ?? []),
    confidence: r.confidence,
    createdAt: NOW,
  });
  written += 1;
}

console.log(`规则 ${rules.length} 条，样本 ${eligible.length} 条作品（≥${MIN_SAMPLE} 播放）`);
console.log(`产出建议 ${written} 条${skipped ? `，${skipped} 条 12 小时内已出过、跳过` : ''}`);
for (const r of results) {
  console.log(`  [${r.rule.severity}] ${r.title}`);
}
process.exit(0);
