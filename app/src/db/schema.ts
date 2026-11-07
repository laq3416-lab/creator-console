import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core';

export const workspace = sqliteTable('workspace', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  platform: text('platform').notNull(),
  handle: text('handle').notNull(),
  nickname: text('nickname'),
  avatarUrl: text('avatar_url'),
  followerCount: integer('follower_count').notNull().default(0),
  workCount: integer('work_count').notNull().default(0),
  lastSyncedAt: integer('last_synced_at'),
  status: text('status').notNull().default('active'),
});

export const content = sqliteTable(
  'content',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    platform: text('platform').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    url: text('url'),
    publishedAt: integer('published_at').notNull(),
    durationSec: integer('duration_sec'),
  },
  (t) => [index('idx_content_pub').on(t.publishedAt)],
);

export const metricPoint = sqliteTable(
  'metric_point',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    key: text('key').notNull(),
    value: real('value').notNull(),
    capturedAt: integer('captured_at').notNull(),
  },
  (t) => [index('idx_metric_lookup').on(t.entityType, t.entityId, t.key, t.capturedAt)],
);

export const conversation = sqliteTable('conversation', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  peerName: text('peer_name').notNull(),
  peerAvatar: text('peer_avatar'),
  unreadCount: integer('unread_count').notNull().default(0),
  lastMessageAt: integer('last_message_at').notNull(),
  tag: text('tag'),
  status: text('status').notNull().default('open'),
});

export const message = sqliteTable('message', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id').notNull(),
  direction: text('direction').notNull(),
  text: text('text').notNull(),
  createdAt: integer('created_at').notNull(),
  isRead: integer('is_read').notNull().default(1),
});

export const suggestion = sqliteTable('suggestion', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  scope: text('scope').notNull(),
  targetId: text('target_id'),
  source: text('source').notNull(),
  ruleId: text('rule_id'),
  evidence: text('evidence'),
  severity: text('severity').notNull(),
  tag: text('tag'),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  action: text('action'),
  confidence: real('confidence'),
  status: text('status').notNull().default('new'),
  createdAt: integer('created_at').notNull(),
});

export const benchmarkAccount = sqliteTable('benchmark_account', {
  id: text('id').primaryKey(),
  platform: text('platform').notNull(),
  handle: text('handle').notNull(),
  followerCount: integer('follower_count').notNull(),
  tier: text('tier').notNull(),
});

export const benchmarkContent = sqliteTable('benchmark_content', {
  id: text('id').primaryKey(),
  benchmarkAccountId: text('benchmark_account_id').notNull(),
  platform: text('platform').notNull(),
  title: text('title').notNull(),
  plays: integer('plays').notNull(),
  likes: integer('likes').notNull().default(0),
  comments: integer('comments').notNull().default(0),
  saves: integer('saves').notNull().default(0),
  durationSec: integer('duration_sec'),
  publishedAt: integer('published_at').notNull(),
  tags: text('tags'),
  videoUrl: text('video_url'),
  takeaway: text('takeaway'),
  takeawayAt: integer('takeaway_at'),
});

export const rule = sqliteTable('rule', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  scope: text('scope').notNull(),
  metricKey: text('metric_key').notNull(),
  op: text('op').notNull(),
  threshold: real('threshold').notNull(),
  severity: text('severity').notNull(),
  title: text('title').notNull(),
  action: text('action'),
  maxItems: integer('max_items').notNull().default(3),
  enabled: integer('enabled').notNull().default(1),
});

export const topic = sqliteTable('topic', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().default('default'),
  title: text('title').notNull(),
  angle: text('angle'),
  structure: text('structure'),
  source: text('source').notNull(),
  sourceRef: text('source_ref'),
  status: text('status').notNull().default('idea'),
  publishedContentId: text('published_content_id'),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
});

export const jobRun = sqliteTable('job_run', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  task: text('task').notNull(),
  status: text('status').notNull(),
  detail: text('detail'),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
});

export const trend = sqliteTable('trend', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source').notNull(),
  word: text('word').notNull(),
  hotValue: integer('hot_value'),
  rank: integer('rank'),
  capturedAt: integer('captured_at').notNull(),
});

export const videoAnalysis = sqliteTable('video_analysis', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  refType: text('ref_type').notNull(),
  refId: text('ref_id').notNull(),
  durationSec: real('duration_sec').notNull(),
  cuts: integer('cuts').notNull(),
  cutsPerSec: real('cuts_per_sec').notNull(),
  avgShotSec: real('avg_shot_sec').notNull(),
  first3sCuts: integer('first3s_cuts').notNull(),
  analyzedAt: integer('analyzed_at').notNull(),
});

export const benchmarkProduct = sqliteTable('benchmark_product', {
  id: text('id').primaryKey(),
  platform: text('platform').notNull().default('xianyu'),
  title: text('title').notNull(),
  price: real('price'),
  wantCount: integer('want_count').notNull().default(0),
  viewCount: integer('view_count').notNull().default(0),
  sellerName: text('seller_name'),
  sellerFans: integer('seller_fans'),
  keyword: text('keyword'),
  listedAt: integer('listed_at'),
  firstSeenAt: integer('first_seen_at'),
  url: text('url'),
});
