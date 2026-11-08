/**
 * 自检：采集静默失败比报错更危险——你以为数据没变，其实是脚本挂了。
 *
 * 检查四类问题：
 *   1. 任务连续失败
 *   2. 任务太久没成功（超过预期周期 2 倍）
 *   3. 采集到 0 条（典型是页面改版 / 登录失效）
 *   4. 登录态失效
 *
 * 有问题就写一条建议，在总览「今日必看」里冒出来。
 *
 * 用法：npm run health
 */
import { openDb } from './lib/ingest.mjs';
import { hasLogin, PLATFORMS } from './lib/paths.mjs';

const db = openDb();
const NOW = Date.now();
const MIN = 60_000;
const HOUR = 60 * MIN;

const TASKS = [
  { key: 'collect', label: '抖音采集', every: 30 * MIN, expect: () => count('content', 'douyin') },
  { key: 'collect:xhs', label: '小红书采集', every: 30 * MIN, expect: () => count('content', 'xhs') },
  { key: 'collect:xianyu', label: '闲鱼采集', every: 60 * MIN, expect: () => count('content', 'xianyu') },
  { key: 'inbox:xhs', label: '小红书私信', every: 5 * MIN, expect: () => count('conversation') },
  { key: 'inbox:xianyu', label: '闲鱼私信', every: 20 * MIN, expect: () => count('conversation') },
  { key: 'inbox:douyin', label: '抖音私信', every: 20 * MIN, expect: () => count('conversation') },
  { key: 'radar', label: '爆款雷达', every: 6 * HOUR, expect: () => count('benchmark_content') },
];

function count(table, platform) {
  if (platform) {
    return db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE platform = ?`).get(platform).n;
  }
  return db.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
}

const PLATFORM_LOGIN = { collect: 'douyin', 'collect:xhs': 'xhs', 'collect:xianyu': 'xianyu', 'inbox:douyin': 'douyin', 'inbox:xhs': 'xhs', 'inbox:xianyu': 'xianyu', radar: 'douyin' };
const DEFAULT_INTERVALS = { douyin: 0, xhs: 360, xianyu: 0 };
function intervalFor(task) {
  const platform = PLATFORM_LOGIN[task.key];
  const row = db.prepare('SELECT interval_minutes FROM sync_setting WHERE platform = ?').get(`task:${task.key}`) ?? db.prepare('SELECT interval_minutes FROM sync_setting WHERE platform = ?').get(platform);
  return (row ? row.interval_minutes : DEFAULT_INTERVALS[platform]) * MIN;
}

const problems = [];

for (const t of TASKS) {
  const last = db
    .prepare(
      `SELECT * FROM job_run WHERE task = ? AND status IN ('ok','failed') ORDER BY finished_at DESC LIMIT 1`,
    )
    .get(t.key);

  // 1) 连续失败
  const recent = db
    .prepare(`SELECT status FROM job_run WHERE task = ? ORDER BY finished_at DESC LIMIT 3`)
    .all(t.key)
    .map((r) => r.status);

  if (recent.length >= 2 && recent.slice(0, 2).every((s) => s === 'failed')) {
    problems.push({
      id: `health_fail_${t.key}`,
      severity: 'red',
      title: `${t.label}连续失败`,
      rationale: `最近两次都没成功。最后一条输出：${(last?.detail ?? '无').slice(0, 120)}`,
      action: '打开「监控」页看运行记录，或手动跑一次看报错',
      evidence: [{ label: '最近状态', mine: recent.slice(0, 3).join(' / '), peer: 'ok' }],
    });
  }

  // 2) 太久没成功
  const expectedInterval = intervalFor(t);
  if (expectedInterval && last?.finished_at && last.status === 'ok') {
    const age = NOW - last.finished_at;
    if (age > expectedInterval * 2) {
      problems.push({
        id: `health_stale_${t.key}`,
        severity: 'amber',
        title: `${t.label}已经 ${Math.round(age / HOUR)} 小时没成功`,
        rationale: `预期每 ${Math.round(expectedInterval / MIN)} 分钟跑一次，现在超期 ${Math.round(age / expectedInterval)} 倍。`,
        action: '检查监控进程是否还在（看「监控」页的心跳）',
        evidence: [{ label: '距上次成功', mine: `${Math.round(age / HOUR)} 小时`, peer: `≤ ${Math.round(expectedInterval / MIN)} 分钟` }],
      });
    }
  }

  // 3) 采集到 0 条
  const n = t.expect();
  if (n === 0 && last?.status === 'ok' && !t.key.startsWith('inbox:')) {
    problems.push({
      id: `health_empty_${t.key}`,
      severity: 'red',
      title: `${t.label}一条数据都没采到`,
      rationale: '典型原因：登录失效、页面改版、或账号确实没有内容。',
      action: '先去「设置」确认登录状态，再看「监控」页的报错输出',
      evidence: [{ label: '采集条数', mine: '0', peer: '> 0' }],
    });
  }
}

// 4) 登录态
for (const p of PLATFORMS) {
  try {
    if (!(await hasLogin(p))) {
      problems.push({
        id: `health_login_${p}`,
        severity: 'amber',
        title: `${p} 登录态失效`,
        rationale: 'Cookies 里找不到登录标记，采集会直接跳过这个平台。',
        action: '去「设置」页重新扫码登录',
        evidence: [{ label: '登录状态', mine: '未登录', peer: '已登录' }],
      });
    }
  } catch {}
}

/* 写入建议：同一天同一条只写一次 */
const ins = db.prepare(`
  INSERT OR IGNORE INTO suggestion
    (id, workspace_id, scope, target_id, source, rule_id, severity, tag, title, rationale, action, evidence, confidence, status, created_at)
  VALUES (?, 'default', 'account', NULL, 'rule', @ruleId, @severity, '自检', @title, @rationale, @action, @evidence, 0.95, 'new', ?)
`);

const day = new Date().toISOString().slice(0, 10);
let written = 0;
for (const p of problems) {
  const r = ins.run(
    `${p.id}_${day}`,
    {
      ruleId: p.id,
      severity: p.severity,
      title: p.title,
      rationale: p.rationale,
      action: p.action,
      evidence: JSON.stringify(p.evidence ?? []),
    },
    NOW,
  );
  written += r.changes;
}

console.log(`自检完成：${problems.length} 个问题，新写入 ${written} 条`);
for (const p of problems) console.log(`  [${p.severity}] ${p.title}`);
if (!problems.length) console.log('  一切正常');
process.exit(0);
