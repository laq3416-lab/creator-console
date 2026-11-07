/**
 * 私信采集
 *
 * 各平台难度差很多：
 *   闲鱼   —— mtop 接口直接返回会话列表 + 最后一条 + 未读数 ✅
 *   小红书 —— 消息页走 WebSocket，接口没暴露 ⏳
 *   抖音   —— IM 走 WebSocket，需要单独攻 ⏳
 *
 * 用法：npm run inbox
 */
import { launch } from './lib/browser.mjs';
import { hasLogin, HEADLESS_OK } from './lib/paths.mjs';
import { execFile } from 'node:child_process';
import { openDb } from './lib/ingest.mjs';

const ONLY = process.argv[2] || null; // 只跑某个平台：xhs / xianyu / douyin
const db = openDb();
const NOW = Date.now();

const upConv = db.prepare(`
  INSERT INTO conversation (id, account_id, peer_name, peer_avatar, unread_count, last_message_at, tag, status)
  VALUES (@id, @accountId, @peerName, @peerAvatar, @unread, @lastAt, @tag, @status)
  ON CONFLICT(id) DO UPDATE SET
    peer_name = excluded.peer_name,
    peer_avatar = excluded.peer_avatar,
    unread_count = excluded.unread_count,
    last_message_at = excluded.last_message_at,
    status = excluded.status
`);

const hasMsg = db.prepare('SELECT 1 FROM message WHERE id = ?');
const insMsg = db.prepare(`
  INSERT INTO message (id, conversation_id, direction, text, created_at, is_read)
  VALUES (?, ?, 'in', ?, ?, 0)
`);

let written = 0;
const fresh = [];   // 这次新出现的消息，用来弹通知

/** macOS 系统通知。失败不影响采集。 */
function notify(title, body) {
  if (process.env.NO_NOTIFY === '1') return;
  const esc = (t) => String(t).replace(/["\\]/g, '\\$&').slice(0, 120);
  try {
    execFile('osascript', [
      '-e',
      `display notification "${esc(body)}" with title "中控台" subtitle "${esc(title)}" sound name "Glass"`,
    ]);
  } catch {}
}

/** 判断这条会话是不是有更新的消息 */
function isNewMessage(convId, lastAt) {
  const prev = db.prepare('SELECT last_message_at FROM conversation WHERE id = ?').get(convId);
  return !prev || Number(prev.last_message_at) < Number(lastAt);
}

/* ---------- 闲鱼 ---------- */

async function collectXianyu() {
  if (!(await hasLogin('xianyu'))) {
    console.log('· 闲鱼未登录，跳过');
    return;
  }

  const { ctx } = await launch({ headless: HEADLESS_OK.has('xianyu'), platform: 'xianyu' });
  let sessions = null;

  const hook = (page) => {
    page.on('response', async (res) => {
      if (!/idlemessage\.pc\.session\.sync/.test(res.url())) return;
      try {
        const j = await res.json();
        const list = j?.data?.sessions ?? [];
        if (list.length) sessions = list;
      } catch {}
    });
  };
  ctx.on('page', hook);
  for (const p of ctx.pages()) hook(p);

  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto('https://www.goofish.com/im', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(10000);
  await ctx.close();

  if (!sessions) {
    console.log('· 闲鱼没抓到会话');
    return;
  }

  const acc = db.prepare("SELECT id FROM account WHERE platform='xianyu' LIMIT 1").get();
  const accId = acc?.id ?? 'acc_xianyu_main';

  for (const s of sessions) {
    const sess = s.session ?? {};
    const summary = s.message?.summary ?? {};
    const peer = sess.userInfo ?? {};
    const isSystem = peer.type === 10 || peer.userId === '100';

    const convId = `xy_${sess.sessionId}`;
    const text = String(summary.summary ?? '').slice(0, 200);
    const lastAt = Number(summary.ts) || NOW;
    const unread = Number(summary.unread) || 0;

    const isNew = isNewMessage(convId, lastAt);
    if (isNew && !isSystem) fresh.push({ peer: peer.fishNick || peer.nick, text });

    upConv.run({
      id: convId,
      accountId: accId,
      peerName: peer.fishNick || peer.nick || '未知',
      peerAvatar: (peer.fishNick || peer.nick || '?').slice(0, 1),
      unread,
      lastAt,
      tag: isSystem ? '系统' : '买家',
      status: unread > 0 ? 'open' : 'pending',
    });

    // 消息正文只有摘要，先落一条，避免会话点进去是空的
    const msgId = `${convId}_${summary.ts ?? lastAt}`;
    if (text && !hasMsg.get(msgId)) {
      insMsg.run(msgId, convId, text, lastAt);
      written += 1;
    }
  }

  console.log(`· 闲鱼：${sessions.length} 个会话，新增/更新消息 ${written} 条`);
}

/* ---------- 小红书 ---------- */

async function collectXhs() {
  if (!(await hasLogin('xhs'))) {
    console.log('· 小红书未登录，跳过');
    return;
  }

  const { ctx } = await launch({ headless: HEADLESS_OK.has('xhs'), platform: 'xhs' });
  let chats = null;

  const hook = (page) => {
    page.on('response', async (res) => {
      if (!/\/api\/im\/web\/v3\/chats/.test(res.url())) return;
      try {
        const j = await res.json();
        const list = j?.data?.chats ?? [];
        if (list.length && !chats) chats = list;
      } catch {}
    });
  };
  ctx.on('page', hook);
  for (const p of ctx.pages()) hook(p);

  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(5000);

  // 自己点「消息」，不需要人工
  let clicked = false;
  try {
    const el = page.locator('text=消息').first();
    if (await el.count()) {
      await el.click({ timeout: 3000 });
      clicked = true;
    }
  } catch {}
  if (!clicked) {
    await page.goto('https://www.xiaohongshu.com/messages', { waitUntil: 'domcontentloaded' }).catch(() => {});
  }
  await page.waitForTimeout(11000);
  await ctx.close();

  if (!chats) {
    console.log('· 小红书没抓到会话');
    return;
  }

  const acc = db.prepare("SELECT id FROM account WHERE platform='xhs' LIMIT 1").get();
  const accId = acc?.id ?? 'acc_xhs_main';
  let n = 0;

  for (const c of chats) {
    const peer = c.info ?? {};
    const convId = `xhs_${c.chat_user_id}`;
    const text = String(c.last_msg_content ?? '').slice(0, 200);
    const lastAt = Number(c.last_msg_time) || Number(c.update_time) || NOW;

    const isNew = isNewMessage(convId, lastAt);
    if (isNew) fresh.push({ peer: peer.nickname || peer.user_name, text });

    upConv.run({
      id: convId,
      accountId: accId,
      peerName: peer.nickname || peer.user_name || '小红书用户',
      peerAvatar: (peer.nickname || peer.user_name || '?').slice(0, 1),
      unread: 0, // 这个接口不返回未读数
      lastAt,
      tag: peer.is_friend ? '互关' : '陌生人',
      status: 'open',
    });

    const msgId = `${convId}_${lastAt}`;
    if (text && !hasMsg.get(msgId)) {
      insMsg.run(msgId, convId, text, lastAt);
      n += 1;
    }
  }

  console.log(`· 小红书：${chats.length} 个会话，新增消息 ${n} 条`);
}

/* ---------- 抖音 ---------- */
/*
 * 抖音的会话走 protobuf WebSocket，解不了。
 * 但消息面板本身是 DOM 渲染的，直接读页面文字更实在。
 * 代价是结构可能变，所以选择器写成容错形式。
 */

/** 把「刚刚 / 14:09 / 昨天 / 前天 / 3月5日」转成时间戳 */
function parseDyTime(str) {
  const t = String(str || '').trim();
  const now = new Date();
  if (!t) return Date.now();
  if (t === '刚刚' || t.includes('秒前')) return Date.now();
  if (t.includes('分钟前')) return Date.now() - Number(t.replace(/\D/g, '')) * 60000;
  if (t.includes('小时前')) return Date.now() - Number(t.replace(/\D/g, '')) * 3600000;
  if (t === '昨天') return Date.now() - 86400000;
  if (t === '前天') return Date.now() - 172800000;
  const hm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    const d = new Date(now);
    d.setHours(Number(hm[1]), Number(hm[2]), 0, 0);
    return d.getTime();
  }
  const md = t.match(/^(\d{1,2})月(\d{1,2})日/);
  if (md) {
    const d = new Date(now.getFullYear(), Number(md[1]) - 1, Number(md[2]));
    return d.getTime();
  }
  return Date.now();
}

async function collectDouyin() {
  if (!(await hasLogin('douyin'))) {
    console.log('· 抖音未登录，跳过');
    return;
  }

  const { ctx } = await launch({ headless: HEADLESS_OK.has('douyin'), platform: 'douyin' });
  const page = ctx.pages()[0] ?? (await ctx.newPage());
  await page.goto('https://www.douyin.com/jingxuan', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.waitForTimeout(5000);

  let opened = false;
  try {
    await page.locator('text=消息').first().click({ timeout: 4000 });
    opened = true;
  } catch {}

  if (!opened) {
    console.log('· 抖音没找到消息入口');
    await ctx.close();
    return;
  }
  await page.waitForTimeout(7000);

  const rows = await page.evaluate(() => {
    return [...document.querySelectorAll('[data-e2e="conversation-item"]')].map((el) => {
      const q = (sel) => el.querySelector(sel)?.textContent?.trim() ?? '';
      const avatar = el.querySelector('img')?.getAttribute('src') ?? '';
      // 注意：外层 wrapper 的 class 也含 "ConversationItemtitle"，
      // querySelector 会先命中它，导致名字和时间粘在一起，这里剥掉尾部时间
      const rawName = q('[class*="ConversationItemtitle"]');
      const name = rawName
        .replace(/(刚刚|昨天|前天|\d{1,2}:\d{2}|\d{1,2}月\d{1,2}日|\d+分钟前|\d+小时前)\s*$/, '')
        .trim();
      return {
        name,
        time: q('[class*="timeStr"]'),
        preview: q('[class*="HinttextBox"]'),
        avatar,
      };
    });
  });

  await ctx.close();

  if (!rows.length) {
    console.log('· 抖音没读到会话');
    return;
  }

  const acc = db.prepare("SELECT id FROM account WHERE platform='douyin' LIMIT 1").get();
  const accId = acc?.id ?? 'acc_douyin_main';
  let n = 0;

  for (const r of rows) {
    if (!r.name) continue;
    // 用头像地址做稳定 id（会话名会改）
    const key = (r.avatar || r.name).replace(/[^\w]/g, '').slice(-24) || r.name;
    const convId = `dy_${key}`;
    const lastAt = parseDyTime(r.time);
    const text = String(r.preview ?? '').slice(0, 200);

    const isNew = isNewMessage(convId, lastAt);
    if (isNew && text) fresh.push({ peer: r.name, text });

    upConv.run({
      id: convId,
      accountId: accId,
      peerName: r.name,
      peerAvatar: r.name.slice(0, 1),
      unread: 0,
      lastAt,
      tag: '私信',
      status: 'open',
    });

    const msgId = `${convId}_${lastAt}`;
    if (text && !hasMsg.get(msgId)) {
      insMsg.run(msgId, convId, text, lastAt);
      n += 1;
    }
  }

  console.log(`· 抖音：${rows.length} 个会话，新增消息 ${n} 条`);
}

/* ---------- 主流程 ---------- */

if (!ONLY || ONLY === 'xianyu') await collectXianyu();
if (!ONLY || ONLY === 'xhs') await collectXhs();
if (!ONLY || ONLY === 'douyin') await collectDouyin();

if (fresh.length) {
  const head = fresh[0];
  const body = fresh.length === 1 ? `${head.peer}：${head.text}` : `${head.peer} 等 ${fresh.length} 条新消息`;
  notify('新私信', body);
  console.log(`\n🔔 新消息 ${fresh.length} 条，已弹系统通知`);
}

const total = db.prepare('SELECT COUNT(*) n FROM conversation').get().n;
const unread = db.prepare('SELECT COALESCE(SUM(unread_count),0) n FROM conversation').get().n;
console.log(`\n会话合计 ${total} 个，未读 ${unread} 条`);
console.log('说明：闲鱼只返回会话摘要，完整对话需要点进会话才有（暂未接）。');
process.exit(0);
