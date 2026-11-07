// 种子数据：仅用于本地开发，真实接入后会全部替换
// 运行：npm run db:seed
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const dataDir = path.join(root, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const dbFile = path.join(dataDir, 'console.db');
if (fs.existsSync(dbFile)) fs.rmSync(dbFile);

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(fs.readFileSync(path.join(root, 'src', 'db', 'schema.sql'), 'utf8'));

const NOW = Date.now();
const DAY = 86_400_000;
const daysAgo = (d) => NOW - Math.round(d * DAY);
const at = (d, h, m) => {
  const t = new Date(daysAgo(d));
  t.setHours(h, m, 0, 0);
  return t.getTime();
};

db.prepare('INSERT INTO workspace (id,name,created_at) VALUES (?,?,?)').run('default', '我的工作区', NOW);

/* ---------- 账号 ---------- */
const accounts = [
  ['acc_dy', 'douyin', '@阿泽搞副业', '阿泽搞副业', 12480, 86, 0],
  ['acc_xhs', 'xhs', '@阿泽的副业手记', '阿泽的副业手记', 6240, 54, 0],
  ['acc_xy', 'xianyu', '@阿泽二手仓', '阿泽二手仓', 210, 23, 12], // 12 分钟前同步
];
const insAcc = db.prepare(
  'INSERT INTO account (id,workspace_id,platform,handle,nickname,follower_count,work_count,last_synced_at) VALUES (?,?,?,?,?,?,?,?)',
);
for (const [id, p, handle, nick, fans, works, lagMin] of accounts) {
  insAcc.run(id, 'default', p, handle, nick, fans, works, NOW - lagMin * 60_000);
}

/* ---------- 作品 ---------- */
const contents = [
  ['c1', 'acc_dy', 'douyin', 'video', '我用这个方法，3个月从0做到1万粉', at(2, 19, 20), 68],
  ['c2', 'acc_dy', 'douyin', 'video', '副业避坑：这5种千万别碰', at(4, 20, 5), 52],
  ['c3', 'acc_dy', 'douyin', 'video', '普通人做自媒体，第一天该做什么', at(6, 18, 40), 74],
  ['c4', 'acc_xhs', 'xhs', 'note', '小红书起号避雷清单（亲测）', at(3, 12, 10), null],
  ['c5', 'acc_xy', 'xianyu', 'item', '我整理的闲鱼定价表', at(5, 9, 30), null],
];
const insContent = db.prepare(
  'INSERT INTO content (id,account_id,platform,type,title,published_at,duration_sec) VALUES (?,?,?,?,?,?,?)',
);
for (const c of contents) insContent.run(...c);

/* ---------- 指标点 ---------- */
const insPoint = db.prepare(
  'INSERT INTO metric_point (entity_type,entity_id,key,value,captured_at) VALUES (?,?,?,?,?)',
);

const series = {
  acc_dy: {
    fans: [9800, 10400, 10900, 11200, 11800, 12124, 12480],
    plays: [18200, 24100, 19800, 32600, 41200, 28400, 24100],
  },
  acc_xhs: {
    fans: [5100, 5340, 5520, 5760, 5900, 6112, 6240],
    plays: [8200, 9400, 7600, 12100, 15400, 11200, 9800],
  },
  acc_xy: {
    fans: [180, 186, 192, 196, 201, 204, 210],
    plays: [1200, 1450, 1320, 1680, 1900, 1560, 1420],
  },
};
for (const [acct, keys] of Object.entries(series)) {
  for (const [key, vals] of Object.entries(keys)) {
    vals.forEach((v, i) => insPoint.run('account', acct, key, v, daysAgo(6 - i)));
  }
}

const contentMetrics = {
  c1: { plays: 182400, likes: 8420, comments: 316, saves: 2140, completion: 0.22 },
  c2: { plays: 46800, likes: 1980, comments: 142, saves: 610, completion: 0.31 },
  c3: { plays: 12300, likes: 420, comments: 38, saves: 96, completion: 0.36 },
  c4: { plays: 28600, likes: 2140, comments: 96, saves: 1820, completion: null },
  c5: { plays: 5400, likes: 86, comments: 12, saves: 64, completion: null },
};
for (const [cid, m] of Object.entries(contentMetrics)) {
  for (const [k, v] of Object.entries(m)) {
    if (v === null) continue;
    insPoint.run('content', cid, k, v, NOW - 5 * 60_000);
  }
}

/* ---------- 私信 ---------- */
const convs = [
  ['cv1', 'acc_xy', '木木子', '木', 1, '询价', [['in', '老板，这个还能便宜吗？包邮不', 2, 19, 12], ['out', '可以小刀，包邮的，今天拍今天发', 2, 19, 13], ['in', '那 85 能出不？我看了下别家…', 2, 19, 14]]],
  ['cv2', 'acc_xy', '小陈同学', '陈', 1, '售后', [['in', '有发票吗？公司报销要用', 2, 19, 6]]],
  ['cv3', 'acc_xy', '大熊', '熊', 2, '砍价', [['in', '80 卖不卖，我诚心要', 2, 18, 55], ['in', '在吗老板', 2, 19, 2]]],
  ['cv4', 'acc_xy', '阿亮', '亮', 3, '求包邮', [['in', '能包个邮吗，我这儿偏远', 2, 17, 20], ['out', '偏远加 8 块，其他包邮', 2, 17, 22], ['in', '行吧，那我拍', 2, 17, 24], ['in', '拍了拍了', 2, 18, 40]]],
  ['cv5', 'acc_xy', '婷婷', '婷', 4, '问成色', [['in', '这个有几成新？有没有磕碰', 2, 16, 40], ['in', '在吗', 2, 17, 10], ['in', '急用，能马上发吗', 2, 18, 5], ['in', '老板？', 2, 19, 0]]],
  ['cv6', 'acc_xy', '老王', '王', 0, '问尺寸', [['in', '尺寸多大，放得下 A4 吗', 2, 15, 48]]],
  ['cv7', 'acc_xy', '绿豆', '绿', 0, '求链接', [['in', '链接失效了，还有货吗', 2, 13, 40]]],
  ['cv8', 'acc_dy', '一只鱼', '鱼', 2, '求资料', [['in', '求第 3 步的详细教程，看不太懂', 2, 18, 53], ['in', '已关注，蹲一个', 2, 18, 54]]],
  ['cv9', 'acc_dy', '老张', '张', 2, '商务', [['in', '你好，看你这号数据不错，合作怎么收费？', 1, 18, 2], ['out', '感谢认可，麻烦说下产品和预算，我发报价单给你', 1, 18, 20], ['in', '母婴类，预算 3000 左右', 1, 18, 31], ['in', '方便的话加个微信？', 1, 19, 10]]],
  ['cv10', 'acc_xhs', 'Momo', 'M', 2, '求链接', [['in', '姐妹这个本子链接能发下吗，找了好久', 2, 18, 34], ['in', '急！', 2, 18, 50]]],
  ['cv11', 'acc_xhs', '小鹿', '鹿', 2, '求教程', [['in', '你视频里那个表格能分享下吗，谢谢！', 2, 17, 50], ['in', '蹲', 2, 18, 20]]],
];

const insConv = db.prepare(
  'INSERT INTO conversation (id,account_id,peer_name,peer_avatar,unread_count,last_message_at,tag,status) VALUES (?,?,?,?,?,?,?,?)',
);
const insMsg = db.prepare(
  'INSERT INTO message (id,conversation_id,direction,text,created_at,is_read) VALUES (?,?,?,?,?,?)',
);
let mi = 0;
for (const [id, acct, name, av, unread, tag, msgs] of convs) {
  const lastAt = at(...msgs[msgs.length - 1].slice(2));
  insConv.run(id, acct, name, av, unread, lastAt, tag, unread > 0 ? 'open' : 'pending');
  for (const [dir, text, ...rest] of msgs) {
    insMsg.run(`m${++mi}`, id, dir, text, at(...rest), dir === 'out' ? 1 : 0);
  }
}

/* ---------- 建议 ---------- */
const suggestions = [
  ['sg1', 'content', 'c1', 'rule', 'red', '规则命中', '完播率跌破账号中位线',
    '《我用这个方法…》完播率 22%，账号中位 41%，前 3 秒跳出 68%。这条的流量池已经停了。',
    '改开头：直接抛结果', 0.82, 12],
  ['sg2', 'account', 'acc_xy', 'rule', 'amber', '待处理', '闲鱼未读私信 12 条，已超 2 小时',
    '询价类占 75%，按你账号历史转化率约等于 3 单流失。', '去收件箱', 0.9, 34],
  ['sg3', 'account', 'acc_dy', 'rule', 'green', '机会', '24 小时涨粉 356，是日均 3.2 倍',
    '与「3 个月 1 万粉」同题材，建议 48 小时内追发同系列续集。', '看选题建议', 0.71, 60],
  ['sg4', 'content', 'c1', 'llm', 'red', '高危', '这条视频的流量已经停了',
    '《我用这个方法，3个月从0做到1万粉》完播率 22%，账号中位 41%。系统判断卡在开头的「信息密度」上。',
    '前 3 秒直接给结果', 0.82, 90],
];
const insSugg = db.prepare(
  'INSERT INTO suggestion (id,workspace_id,scope,target_id,source,severity,tag,title,rationale,action,confidence,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
);
for (const [id, scope, tid, source, sev, tag, title, why, act, conf, mins] of suggestions) {
  insSugg.run(id, 'default', scope, tid, source, sev, tag, title, why, act, conf, NOW - mins * 60_000);
}

/* ---------- 对标 ---------- */
const benchAccounts = [
  ['ba_head1', 'douyin', '@职场老王', 1_280_000, 'head'],
  ['ba_head2', 'douyin', '@搞钱日记', 860_000, 'head'],
  ['ba_peer1', 'douyin', '@阿May搞副业', 28_000, 'peer'],
  ['ba_peer2', 'douyin', '@小周存钱记', 14_000, 'peer'],
  ['ba_peer3', 'douyin', '@栗子副业', 36_000, 'peer'],
  ['ba_peer4', 'douyin', '@晚风搞钱', 9_000, 'peer'],
  ['ba_peer5', 'douyin', '@表格控小林', 21_000, 'peer'],
  ['ba_self', 'douyin', '@阿泽搞副业', 12_480, 'self'],
];
const insBa = db.prepare('INSERT INTO benchmark_account (id,platform,handle,follower_count,tier) VALUES (?,?,?,?,?)');
for (const b of benchAccounts) insBa.run(...b);

const benchContents = [
  ['bc1', 'ba_peer1', 'douyin', '上班摸鱼做的副业，第3个月收入破万', 920_000, 41_000, 1_240, 8_600, 32, 2, '结果前置,数字标题,口播'],
  ['bc2', 'ba_peer2', 'douyin', '我把工资卡分开之后，一年多存了2万', 410_000, 18_600, 720, 5_200, 41, 4, '身份代入,具体数字,对比'],
  ['bc3', 'ba_peer3', 'douyin', '0成本起步，我先做了这3件事', 780_000, 35_200, 980, 6_900, 28, 1, '清单结构,低门槛,可执行'],
  ['bc4', 'ba_peer4', 'douyin', '别做自媒体了，除非你能接受这3点', 260_000, 12_400, 1_100, 3_100, 55, 6, '反常识,强钩子,情绪'],
  ['bc5', 'ba_peer5', 'douyin', '我用一个表格管完了所有副业', 340_000, 15_800, 460, 4_400, 36, 3, '工具演示,3段式,实用'],
  ['bc6', 'ba_head1', 'douyin', '为什么你越努力越穷？', 21_000_000, 860_000, 42_000, 310_000, 72, 3, '焦虑共鸣,提问式,泛人群'],
  ['bc7', 'ba_head2', 'douyin', '普通人一年存下10万的3个习惯', 15_600_000, 720_000, 28_000, 240_000, 58, 5, '清单结构,数字标题,泛人群'],
  ['bc8', 'ba_self', 'douyin', '我用这个方法，3个月从0做到1万粉', 182_400, 8_420, 316, 2_140, 68, 2, '数字标题,过程复盘,口播'],
];
const insBc = db.prepare(
  'INSERT INTO benchmark_content (id,benchmark_account_id,platform,title,plays,likes,comments,saves,duration_sec,published_at,tags) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
);
for (const [id, ba, p, title, plays, likes, cmts, saves, dur, d, tags] of benchContents) {
  insBc.run(id, ba, p, title, plays, likes, cmts, saves, dur, daysAgo(d), tags);
}

const count = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t}`).get().n;
console.log(
  `种子完成 → 账号 ${count('account')} / 作品 ${count('content')} / 指标点 ${count('metric_point')} / 会话 ${count('conversation')} / 对标 ${count('benchmark_content')}`,
);
