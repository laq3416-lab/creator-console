/**
 * 数据保留策略：只留有参考价值的，老的清掉。
 *
 * 判断标准不是「多老」，而是「还有没有用」：
 *   · 爆款：赞粉比高的留久一点（结构还有参考价值），平庸的很快清掉
 *   · 指标点：每条作品每个指标只留最近 20 个快照，够画趋势
 *   · 运行记录 / 热榜：7 天
 *
 * 用法：npm run prune
 */
import { openDb } from './lib/ingest.mjs';

const db = openDb();
const DAY = 86_400_000;
const NOW = Date.now();

const before = (sql, ...args) => db.prepare(sql).get(...args)?.n ?? 0;

function run(label, sql, ...args) {
  const n0 = db.prepare('SELECT changes() n').get().n;
  const info = db.prepare(sql).run(...args);
  if (info.changes) console.log(`  ${label}：清掉 ${info.changes} 条`);
  return info.changes;
}

console.log('清理开始');

// 1) 平庸爆款 14 天、优质爆款 90 天
run(
  '平庸爆款（赞粉比<3，14天前）',
  `DELETE FROM benchmark_content
    WHERE first_seen_at < ?
      AND (likes * 1.0 / (SELECT follower_count FROM benchmark_account a WHERE a.id = benchmark_content.benchmark_account_id)) < 3`,
  NOW - 14 * DAY,
);
run(
  '老爆款（90天前）',
  `DELETE FROM benchmark_content WHERE first_seen_at < ?`,
  NOW - 90 * DAY,
);

// 2) 没有爆款的空壳对标账号
run(
  '空壳对标账号',
  `DELETE FROM benchmark_account WHERE id NOT IN (SELECT DISTINCT benchmark_account_id FROM benchmark_content)`,
);

// 3) 指标点：每条作品每指标保留最近 20 个
run(
  '冗余指标点（保留每项最近20个）',
  `DELETE FROM metric_point WHERE entity_type='content' AND id IN (
     SELECT id FROM (
       SELECT id, ROW_NUMBER() OVER (PARTITION BY entity_id, key ORDER BY captured_at DESC) rn
         FROM metric_point WHERE entity_type='content'
     ) WHERE rn > 20
   )`,
);

// 4) 账号级指标留 180 天
run(
  '旧账号指标（180天前）',
  `DELETE FROM metric_point WHERE entity_type='account' AND captured_at < ?`,
  NOW - 180 * DAY,
);

// 5) 运行记录、热榜 7 天
run('旧运行记录（7天前）', `DELETE FROM job_run WHERE started_at < ?`, NOW - 7 * DAY);
run('旧热榜（7天前）', `DELETE FROM trend WHERE captured_at < ?`, NOW - 7 * DAY);

// 6) 已读/已完成的老建议 60 天
run(
  "归档建议（60天前且非 new）",
  `DELETE FROM suggestion WHERE status IN ('done','ignored') AND created_at < ?`,
  NOW - 60 * DAY,
);

const stat = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
console.log(
  `剩余：爆款 ${stat('benchmark_content')} / 对标号 ${stat('benchmark_account')} / 指标点 ${stat('metric_point')} / 运行记录 ${stat('job_run')} / 热榜 ${stat('trend')}`,
);
process.exit(0);
