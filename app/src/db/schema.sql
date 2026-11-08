-- 自媒体中控台 · 数据库结构
-- 约定：所有时间字段都是 unix 毫秒时间戳（integer）
-- 所有业务表带 workspace_id，当前固定为 'default'，为将来团队版预留

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspace (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);

-- 一个平台的一个账号
CREATE TABLE IF NOT EXISTS account (
  id              TEXT PRIMARY KEY,
  workspace_id    TEXT NOT NULL DEFAULT 'default',
  platform        TEXT NOT NULL,              -- douyin | xhs | xianyu
  handle          TEXT NOT NULL,
  nickname        TEXT,
  avatar_url      TEXT,
  follower_count  INTEGER NOT NULL DEFAULT 0,
  work_count      INTEGER NOT NULL DEFAULT 0,
  last_synced_at  INTEGER,
  status          TEXT NOT NULL DEFAULT 'active'
);
CREATE INDEX IF NOT EXISTS idx_account_ws ON account(workspace_id, platform);

-- 作品 / 笔记 / 商品，三平台共用
CREATE TABLE IF NOT EXISTS content (
  id            TEXT PRIMARY KEY,
  account_id    TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL,
  type          TEXT NOT NULL,                -- video | note | item
  title         TEXT NOT NULL,
  url           TEXT,
  published_at  INTEGER NOT NULL,
  duration_sec  INTEGER
);
CREATE INDEX IF NOT EXISTS idx_content_pub ON content(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_content_acct ON content(account_id, published_at DESC);

-- 指标点：长表 + key，加平台加指标零成本
CREATE TABLE IF NOT EXISTS metric_point (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type  TEXT NOT NULL,                 -- account | content
  entity_id    TEXT NOT NULL,
  key          TEXT NOT NULL,                 -- plays | likes | fans | completion ...
  value        REAL NOT NULL,
  captured_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_metric_lookup
  ON metric_point(entity_type, entity_id, key, captured_at);

-- 会话与消息
CREATE TABLE IF NOT EXISTS conversation (
  id                TEXT PRIMARY KEY,
  account_id        TEXT NOT NULL REFERENCES account(id) ON DELETE CASCADE,
  peer_name         TEXT NOT NULL,
  peer_avatar       TEXT,
  unread_count      INTEGER NOT NULL DEFAULT 0,
  last_message_at   INTEGER NOT NULL,
  tag               TEXT,
  status            TEXT NOT NULL DEFAULT 'open'   -- open | pending | resolved
);
CREATE INDEX IF NOT EXISTS idx_conv_last ON conversation(last_message_at DESC);

CREATE TABLE IF NOT EXISTS message (
  id               TEXT PRIMARY KEY,
  conversation_id  TEXT NOT NULL REFERENCES conversation(id) ON DELETE CASCADE,
  direction        TEXT NOT NULL,             -- in | out
  text             TEXT NOT NULL,
  created_at       INTEGER NOT NULL,
  is_read          INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_msg_conv ON message(conversation_id, created_at);

-- 系统产出的建议
CREATE TABLE IF NOT EXISTS suggestion (
  id           TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL DEFAULT 'default',
  scope        TEXT NOT NULL,                 -- account | content | channel
  target_id    TEXT,
  source       TEXT NOT NULL,                 -- rule | llm
  rule_id      TEXT,                          -- 命中的规则，便于回溯
  evidence     TEXT,                          -- JSON：[{label,mine,peer}] 对比证据，没有就不该出这条建议
  severity     TEXT NOT NULL,                 -- red | amber | green
  tag          TEXT,
  title        TEXT NOT NULL,
  rationale    TEXT NOT NULL,
  action       TEXT,
  confidence   REAL,
  status       TEXT NOT NULL DEFAULT 'new',   -- new | read | done | ignored
  created_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sugg_created ON suggestion(created_at DESC);

-- 对标账号（别人的号）
CREATE TABLE IF NOT EXISTS benchmark_account (
  id             TEXT PRIMARY KEY,
  platform       TEXT NOT NULL,
  handle         TEXT NOT NULL,
  follower_count INTEGER NOT NULL,
  tier           TEXT NOT NULL               -- peer | head | self
);

-- 对标爆款
CREATE TABLE IF NOT EXISTS benchmark_content (
  id                   TEXT PRIMARY KEY,
  benchmark_account_id TEXT NOT NULL REFERENCES benchmark_account(id) ON DELETE CASCADE,
  platform             TEXT NOT NULL,
  title                TEXT NOT NULL,
  plays                INTEGER NOT NULL,
  likes                INTEGER NOT NULL DEFAULT 0,
  comments             INTEGER NOT NULL DEFAULT 0,
  saves                INTEGER NOT NULL DEFAULT 0,
  duration_sec         INTEGER,
  published_at         INTEGER NOT NULL,
  tags                 TEXT,                 -- 逗号分隔的结构标签
  takeaway             TEXT,                 -- JSON：能借鉴的点（模型拆解结果）
  takeaway_at          INTEGER
);
CREATE INDEX IF NOT EXISTS idx_bench_pub ON benchmark_content(published_at DESC);

-- 规则阈值：全部可调，不写死在代码里
CREATE TABLE IF NOT EXISTS rule (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  scope       TEXT NOT NULL,                  -- content | content_agg | account | data
  metric_key  TEXT NOT NULL,
  op          TEXT NOT NULL,                  -- lt | lte | gt | gte | eq
  threshold   REAL NOT NULL,
  severity    TEXT NOT NULL,                  -- red | amber | green
  title       TEXT NOT NULL,
  action      TEXT,
  max_items   INTEGER NOT NULL DEFAULT 3,
  enabled     INTEGER NOT NULL DEFAULT 1
);

-- 选题库：从建议落到「拍什么」，拍完能对回数据
CREATE TABLE IF NOT EXISTS topic (
  id                   TEXT PRIMARY KEY,
  workspace_id         TEXT NOT NULL DEFAULT 'default',
  title                TEXT NOT NULL,
  angle                TEXT,                  -- 切入点
  structure            TEXT,                  -- 开头/中段/结尾
  source               TEXT NOT NULL,         -- llm | manual | radar
  source_ref           TEXT,                  -- 参考爆款 id 或规则 id
  status               TEXT NOT NULL DEFAULT 'idea',  -- idea | planned | shot | published | dropped
  published_content_id TEXT,                  -- 发布后关联作品，用于回看效果
  note                 TEXT,
  created_at           INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_topic_status ON topic(status, created_at DESC);

-- 每次任务运行留痕，监控页面靠它显示「上次/下次/最近发生了什么」
CREATE TABLE IF NOT EXISTS job_run (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  task        TEXT NOT NULL,               -- collect | radar | rules | analyze
  status      TEXT NOT NULL,               -- running | ok | failed
  detail      TEXT,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_job_started ON job_run(started_at DESC);

-- 平台热榜：选题的第一个外部信号
CREATE TABLE IF NOT EXISTS trend (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  source      TEXT NOT NULL,               -- douyin_hot
  word        TEXT NOT NULL,
  hot_value   INTEGER,
  rank        INTEGER,
  captured_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trend_cap ON trend(captured_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_trend_uniq ON trend(source, word, captured_at);

-- 视频结构分析：镜头切换频率用来量化「节奏/动效」
CREATE TABLE IF NOT EXISTS video_analysis (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ref_type       TEXT NOT NULL,             -- content | benchmark
  ref_id         TEXT NOT NULL,
  duration_sec   REAL NOT NULL,
  cuts           INTEGER NOT NULL,          -- 镜头切换次数
  cuts_per_sec   REAL NOT NULL,             -- 每秒切几刀，动效强度
  avg_shot_sec   REAL NOT NULL,             -- 平均镜头时长
  first3s_cuts   INTEGER NOT NULL,          -- 前 3 秒切了几刀（钩子节奏）
  analyzed_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_va_ref ON video_analysis(ref_type, ref_id);

-- 闲鱼同类商品对标：商品不是作品，指标维度完全不同，单独一张表
CREATE TABLE IF NOT EXISTS benchmark_product (
  id            TEXT PRIMARY KEY,
  platform      TEXT NOT NULL DEFAULT 'xianyu',
  title         TEXT NOT NULL,
  price         REAL,
  want_count    INTEGER NOT NULL DEFAULT 0,   -- 想要
  view_count    INTEGER NOT NULL DEFAULT 0,   -- 浏览
  seller_name   TEXT,
  seller_fans   INTEGER,
  keyword       TEXT,                          -- 从哪个关键词搜到的
  listed_at     INTEGER,
  first_seen_at INTEGER,
  url           TEXT
);
CREATE INDEX IF NOT EXISTS idx_bp_keyword ON benchmark_product(keyword, first_seen_at DESC);

-- 用户的同步频率（分钟；0 表示手动）和等待调度的请求
CREATE TABLE IF NOT EXISTS sync_setting (platform TEXT PRIMARY KEY, interval_minutes INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sync_request (task TEXT PRIMARY KEY, requested_at INTEGER NOT NULL);
