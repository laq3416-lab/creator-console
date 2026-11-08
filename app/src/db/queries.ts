import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from './index';
import {
  benchmarkProduct,
  videoAnalysis,
  jobRun,
  topic,
  account,
  benchmarkAccount,
  benchmarkContent,
  content,
  conversation,
  message,
  metricPoint,
  suggestion,
} from './schema';
import type { Platform } from '@/lib/format';

/* ---------- 指标 ---------- */

/** 取某项指标最近的 N 个点，返回时间正序 */
export function getSeries(entityType: string, entityId: string, key: string, limit = 7): number[] {
  const rows = db
    .select({ v: metricPoint.value })
    .from(metricPoint)
    .where(
      and(
        eq(metricPoint.entityType, entityType),
        eq(metricPoint.entityId, entityId),
        eq(metricPoint.key, key),
      ),
    )
    .orderBy(desc(metricPoint.capturedAt))
    .limit(limit)
    .all();
  return rows.map((r) => r.v).reverse();
}

/** 批量取作品指标，避免 N+1 */
export function getContentStats(ids: string[]): Map<string, Record<string, number>> {
  const map = new Map<string, Record<string, number>>();
  if (!ids.length) return map;
  const rows = db
    .select({
      id: metricPoint.entityId,
      key: metricPoint.key,
      value: metricPoint.value,
    })
    .from(metricPoint)
    .where(and(eq(metricPoint.entityType, 'content'), inArray(metricPoint.entityId, ids)))
    // 同一条指标会被反复采集，按时间升序遍历，后面的覆盖前面的 = 取最新
    .orderBy(metricPoint.capturedAt)
    .all();
  for (const r of rows) {
    const cur = map.get(r.id) ?? {};
    cur[r.key] = r.value;
    map.set(r.id, cur);
  }
  return map;
}

/* ---------- 账号 ---------- */

export function getAccounts() {
  return db.select().from(account).orderBy(account.platform).all();
}

export function getAccountsWithSeries() {
  return getAccounts().map((a) => ({
    ...a,
    fansSeries: getSeries('account', a.id, 'fans'),
    gainSeries: getSeries('account', a.id, 'fans_gain'),
    playsSeries: getSeries('account', a.id, 'plays'),
  }));
}

/* ---------- 作品 ---------- */

export function getContents(platform?: Platform) {
  const rows = platform
    ? db.select().from(content).where(eq(content.platform, platform)).orderBy(desc(content.publishedAt)).all()
    : db.select().from(content).orderBy(desc(content.publishedAt)).all();

  const stats = getContentStats(rows.map((r) => r.id));
  return rows.map((r) => {
    const s = stats.get(r.id) ?? {};
    const metric = (key: string): number | null => Object.hasOwn(s, key) ? s[key] : null;
    return {
      ...r,
      plays: metric('plays'),
      likes: metric('likes'),
      comments: metric('comments'),
      saves: metric('saves'),
      completion: metric('completion'),
    };
  });
}

export function getContentById(id: string) {
  return db.select().from(content).where(eq(content.id, id)).get();
}

/* ---------- 私信 ---------- */

export function getConversations(platform?: Platform) {
  const base = db
    .select({
      conv: conversation,
      platform: account.platform,
      handle: account.handle,
    })
    .from(conversation)
    .innerJoin(account, eq(conversation.accountId, account.id))
    .orderBy(desc(conversation.lastMessageAt));

  const rows = platform ? base.where(eq(account.platform, platform)).all() : base.all();

  return rows.map((r) => {
    const last = db
      .select({ text: message.text })
      .from(message)
      .where(eq(message.conversationId, r.conv.id))
      .orderBy(desc(message.createdAt))
      .limit(1)
      .get();
    return { ...r.conv, platform: r.platform as Platform, handle: r.handle, lastText: last?.text ?? '' };
  });
}

export function getMessages(conversationId: string) {
  return db
    .select()
    .from(message)
    .where(eq(message.conversationId, conversationId))
    .orderBy(message.createdAt)
    .all();
}

/* ---------- 建议 ---------- */

export function getSuggestions(limit = 10) {
  return db.select().from(suggestion).orderBy(desc(suggestion.createdAt)).limit(limit).all();
}

export function getSuggestionsBySeverity() {
  const all = getSuggestions(20);
  return {
    alerts: all.filter((s) => s.source === 'rule').slice(0, 3),
    cards: all,
  };
}

/* ---------- 对标 ---------- */

export type BenchRow = {
  id: string;
  title: string;
  handle: string;
  followerCount: number;
  platform: Platform;
  plays: number;
  likes: number;
  comments: number;
  saves: number;
  durationSec: number | null;
  publishedAt: number;
  tags: string[];
  ratio: number;
  ratioBasis: 'plays' | 'likes' | 'likes-abs';
};

export function getBenchmarkRows(tier: 'peer' | 'head' | 'small' | 'self'): BenchRow[] {
  const rows = db
    .select({
      id: benchmarkContent.id,
      title: benchmarkContent.title,
      handle: benchmarkAccount.handle,
      followerCount: benchmarkAccount.followerCount,
      platform: benchmarkContent.platform,
      plays: benchmarkContent.plays,
      likes: benchmarkContent.likes,
      comments: benchmarkContent.comments,
      saves: benchmarkContent.saves,
      durationSec: benchmarkContent.durationSec,
      publishedAt: benchmarkContent.publishedAt,
      tags: benchmarkContent.tags,
    })
    .from(benchmarkContent)
    .innerJoin(benchmarkAccount, eq(benchmarkContent.benchmarkAccountId, benchmarkAccount.id))
    .where(eq(benchmarkAccount.tier, tier))
    .all();

  return rows
    .map((r) => {
      // 抖音公开页不返回播放量（play_count 恒为 0），只能用点赞做超额基准
      // 有播放用播放，没播放用点赞；两者都要除以粉丝数
      // 粉丝数拿不到时（小红书搜索接口不返回），退化成绝对点赞排序
      if (!r.followerCount) {
        return {
          ...r,
          platform: r.platform as Platform,
          tags: (r.tags ?? '').split(',').filter(Boolean),
          ratio: r.likes,
          ratioBasis: 'likes-abs' as const,
        };
      }
      const basis: 'plays' | 'likes' = r.plays > 0 ? 'plays' : 'likes';
      const num = basis === 'plays' ? r.plays : r.likes;
      return {
        ...r,
        platform: r.platform as Platform,
        tags: (r.tags ?? '').split(',').filter(Boolean),
        ratio: num / r.followerCount,
        ratioBasis: basis,
      };
    })
    // 同级按超额系数排（谁用更少的粉丝做出更大的播放），头部按绝对播放排
    .sort((a, b) => (tier === 'peer' ? b.ratio - a.ratio : b.plays - a.plays));
}

/** 同级爆款的中位数，用于「我 vs 同级」对比 */
export function getBenchmarkMedian(tier: 'peer' | 'head' = 'peer') {
  const rows = getBenchmarkRows(tier);
  if (!rows.length) return null;
  const median = (xs: number[]) => {
    if (!xs.length) return null;
    const s = [...xs].sort((a, b) => a - b);
    const mid = Math.floor(s.length / 2);
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };
  return {
    count: rows.length,
    durationSec: median(rows.filter((r) => r.durationSec).map((r) => r.durationSec!)),
    ratio: median(rows.map((r) => r.ratio)),
    commentPerFan: median(rows.map((r) => (r.followerCount ? r.comments / r.followerCount : 0))),
    basis: rows[0]?.ratioBasis ?? 'likes',
  };
}

/* ---------- 导航计数 ---------- */

export function getNavCounts() {
  const contentCount = db.select({ n: sql<number>`count(*)` }).from(content).get()?.n ?? 0;
  const unread = db.select({ n: sql<number>`coalesce(sum(unread_count),0)` }).from(conversation).get()?.n ?? 0;
  const benchCount = db.select({ n: sql<number>`count(*)` }).from(benchmarkContent).get()?.n ?? 0;
  const newSugg = db
    .select({ n: sql<number>`count(*)` })
    .from(suggestion)
    .where(eq(suggestion.status, 'new'))
    .get()?.n ?? 0;
  const accountCount = db.select({ n: sql<number>`count(*)` }).from(account).get()?.n ?? 0;
  return { contentCount, unread, benchCount, newSugg, accountCount };
}

/** 按账号统计未读，账号卡要显示各自的数字，不能都用总数 */
export function getUnreadByAccount(): Record<string, number> {
  const rows = db
    .select({ id: conversation.accountId, n: sql<number>`coalesce(sum(unread_count),0)` })
    .from(conversation)
    .groupBy(conversation.accountId)
    .all();
  return Object.fromEntries(rows.map((r) => [r.id, r.n ?? 0]));
}

/** 最近一次同步时间，用来显示「数据截至」 */
export function getLastSyncedAt(): number | null {
  const row = db
    .select({ t: sql<number>`max(last_synced_at)` })
    .from(account)
    .get();
  return row?.t ?? null;
}


/* ---------- 监控 ---------- */

export function getJobRuns(limit = 40) {
  return db.select().from(jobRun).orderBy(desc(jobRun.startedAt)).limit(limit).all();
}

/** 每个任务最近一次成功/失败 */
export function getLastRunByTask() {
  const rows = db.select().from(jobRun).orderBy(desc(jobRun.startedAt)).limit(200).all();
  const map: Record<string, typeof rows[number]> = {};
  for (const r of rows) {
    if (r.status === 'running') continue;
    if (!map[r.task]) map[r.task] = r;
  }
  return map;
}

export function getNewViralSuggestions(limit = 5) {
  return db
    .select()
    .from(suggestion)
    .where(eq(suggestion.source, 'radar'))
    .orderBy(desc(suggestion.createdAt))
    .limit(limit)
    .all();
}

export function getTopicCount() {
  return (
    db
      .select({ n: sql<number>`count(*)` })
      .from(topic)
      .where(sql`status NOT IN ('published','dropped')`)
      .get()?.n ?? 0
  );
}


/* ---------- 视频结构 ---------- */

export function getVideoComparison() {
  const rows = db.select().from(videoAnalysis).all();
  const mine = rows.filter((r) => r.refType === 'content');
  const peer = rows.filter((r) => r.refType === 'benchmark');
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    mineCount: mine.length,
    peerCount: peer.length,
    mine: {
      cutsPerSec: avg(mine.map((r) => r.cutsPerSec)),
      avgShotSec: avg(mine.map((r) => r.avgShotSec)),
      first3sCuts: avg(mine.map((r) => r.first3sCuts)),
    },
    peer: {
      cutsPerSec: avg(peer.map((r) => r.cutsPerSec)),
      avgShotSec: avg(peer.map((r) => r.avgShotSec)),
      first3sCuts: avg(peer.map((r) => r.first3sCuts)),
    },
    staticOnes: mine.filter((r) => r.cuts === 0).map((r) => r.refId),
  };
}


/* ---------- 单个爆款 ---------- */

export function getBenchmarkById(id: string) {
  const row = db
    .select({
      id: benchmarkContent.id,
      title: benchmarkContent.title,
      platform: benchmarkContent.platform,
      plays: benchmarkContent.plays,
      likes: benchmarkContent.likes,
      comments: benchmarkContent.comments,
      saves: benchmarkContent.saves,
      durationSec: benchmarkContent.durationSec,
      publishedAt: benchmarkContent.publishedAt,
      tags: benchmarkContent.tags,
      takeaway: benchmarkContent.takeaway,
      videoUrl: benchmarkContent.videoUrl,
      handle: benchmarkAccount.handle,
      followerCount: benchmarkAccount.followerCount,
      tier: benchmarkAccount.tier,
    })
    .from(benchmarkContent)
    .innerJoin(benchmarkAccount, eq(benchmarkContent.benchmarkAccountId, benchmarkAccount.id))
    .where(eq(benchmarkContent.id, id))
    .get();
  if (!row) return null;
  return {
    ...row,
    platform: row.platform as Platform,
    tagList: (row.tags ?? '').split(',').filter(Boolean),
    ratio: row.followerCount ? row.likes / row.followerCount : 0,
    url: row.platform === 'douyin' && /^bc_\d+$/.test(row.id)
      ? `https://www.douyin.com/video/${row.id.slice(3)}` : null,
  };
}

/** 历史雷达建议把作品 ID 编进建议 ID；只在作品仍存在时提供详情入口。 */
export function getRadarSuggestionTarget(s: { source: string; ruleId: string | null; targetId: string | null; id: string }): string | null {
  if (s.source !== 'radar' || s.ruleId !== 'radar_new_viral') return null;
  const id = s.targetId ?? (s.id.startsWith('sg_radar_bc_') ? s.id.slice('sg_radar_'.length) : null);
  if (!id) return null;
  const row = db.select({ id: benchmarkContent.id }).from(benchmarkContent).where(eq(benchmarkContent.id, id)).get();
  return row?.id ?? null;
}

export function getRhythm(refType: 'content' | 'benchmark', refId: string) {
  return db
    .select()
    .from(videoAnalysis)
    .where(and(eq(videoAnalysis.refType, refType), eq(videoAnalysis.refId, refId)))
    .get();
}


/* ---------- 闲鱼商品分析 ---------- */

export type MyProduct = {
  id: string;
  title: string;
  price: number | null;
  exposure: number;
  views: number;
  wants: number;
  deals: number;
  publishedAt: number;
  wantRate: number;   // 想要 / 浏览
  dealRate: number;   // 成交 / 浏览
};

export function getMyProducts(): MyProduct[] {
  const rows = db.select().from(content).where(eq(content.platform, 'xianyu')).orderBy(desc(content.publishedAt)).all();
  const stats = getContentStats(rows.map((r) => r.id));

  return rows.map((r) => {
    const m = stats.get(r.id) ?? {};
    const views = m.views ?? 0;
    return {
      id: r.id,
      title: r.title,
      price: (m.price as number) ?? null,
      exposure: m.exposure ?? 0,
      views,
      wants: m.wants ?? 0,
      deals: m.deals ?? 0,
      publishedAt: r.publishedAt,
      wantRate: views ? (m.wants ?? 0) / views : 0,
      dealRate: views ? (m.deals ?? 0) / views : 0,
    };
  });
}

export function getBenchmarkProducts() {
  return db.select().from(benchmarkProduct).orderBy(desc(benchmarkProduct.firstSeenAt)).all();
}

/** 同类商品的价格分位与想要数中位，用来判断「我贵不贵、有没有人想要」 */
export function getProductBenchmark() {
  const rows = getBenchmarkProducts();
  if (!rows.length) return null;

  const prices = rows.map((r) => r.price).filter((p): p is number => p != null && p > 0).sort((a, b) => a - b);
  const wants = rows.map((r) => r.wantCount).sort((a, b) => a - b);
  const quantile = (arr: number[], q: number) => {
    if (!arr.length) return null;
    const i = (arr.length - 1) * q;
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return arr[lo] + (arr[hi] - arr[lo]) * (i - lo);
  };

  const median = (arr: number[]) => quantile(arr, 0.5);

  return {
    count: rows.length,
    price: {
      min: prices[0] ?? null,
      p25: quantile(prices, 0.25),
      median: median(prices),
      p75: quantile(prices, 0.75),
      max: prices[prices.length - 1] ?? null,
    },
    wantMedian: median(wants),
    wantTop: quantile(wants, 0.9),
  };
}


/* ---------- 单个作品详情 ---------- */

export function getContentDetail(id: string) {
  const row = db.select().from(content).where(eq(content.id, id)).get();
  if (!row) return null;
  const stats = getContentStats([id]).get(id) ?? {};
  const metricTimes: Record<string, number> = {};
  for (const point of db.select({key: metricPoint.key, capturedAt: metricPoint.capturedAt}).from(metricPoint).where(and(eq(metricPoint.entityType, 'content'), eq(metricPoint.entityId, id))).orderBy(metricPoint.capturedAt).all()) metricTimes[point.key] = point.capturedAt;
  const metric = (key: string): number | null => Object.hasOwn(stats, key) ? stats[key] : null;
  const rhythm = getRhythm('content', id);
  const related = db
    .select()
    .from(suggestion)
    .where(eq(suggestion.targetId, id))
    .orderBy(desc(suggestion.createdAt))
    .limit(5)
    .all();

  return {
    ...row,
    stats: {
      plays: metric('plays'),
      likes: metric('likes'),
      comments: metric('comments'),
      saves: metric('saves'),
      shares: metric('shares'),
      completion: metric('completion'),
      completion5s: stats.completion_5s ?? null,
      bounce2s: stats.bounce_2s ?? null,
      avgViewSec: stats.avg_view_sec ?? null,
      exposure: stats.exposure ?? null,
    },
    metricTimes,
    rhythm: rhythm ?? null,
    related,
  };
}
