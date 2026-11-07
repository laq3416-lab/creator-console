/**
 * 数据契约：每个指标要有明确区间，越界就拒绝入库，绝不静默补零。
 * 这条规则比任何功能都重要——看板一旦开始骗人，你就不会再信它。
 */

export const KNOWN_PLATFORMS = new Set(['douyin', 'xhs', 'xianyu']);
const DAY = 86_400_000;
const YEAR = 365 * DAY;

const err = (msg) => msg;

export function validateAccount(a) {
  const e = [];
  if (!a || typeof a !== 'object') return [err('账号记录不是对象')];
  if (!KNOWN_PLATFORMS.has(a.platform)) e.push(`未知平台: ${a.platform}`);
  if (typeof a.handle !== 'string' || !a.handle.trim()) e.push('handle 为空');
  else if (a.handle.length > 64) e.push('handle 过长');
  if (!Number.isInteger(a.followerCount) || a.followerCount < 0) e.push(`粉丝数非法: ${a.followerCount}`);
  else if (a.followerCount > 1e9) e.push(`粉丝数超出合理范围: ${a.followerCount}`);
  return e;
}

export function validateContent(c, now = Date.now()) {
  const e = [];
  if (!c || typeof c !== 'object') return [err('作品记录不是对象')];
  if (!KNOWN_PLATFORMS.has(c.platform)) e.push(`未知平台: ${c.platform}`);
  if (typeof c.externalId !== 'string' || !c.externalId.trim()) e.push('externalId 为空');
  if (typeof c.title !== 'string' || !c.title.trim()) e.push('标题为空');
  else if (c.title.length > 200) e.push('标题过长');

  if (!Number.isFinite(c.publishedAt)) e.push(`发布时间非法: ${c.publishedAt}`);
  else {
    if (c.publishedAt < now - 3 * YEAR) e.push('发布时间早于 3 年前，疑似解析错误');
    if (c.publishedAt > now + DAY) e.push('发布时间在未来，疑似时区/单位错误');
  }

  const m = c.metrics ?? {};
  for (const k of ['plays', 'likes', 'comments', 'saves']) {
    if (m[k] == null) continue;
    if (!Number.isFinite(m[k]) || m[k] < 0) e.push(`${k} 非法: ${m[k]}`);
  }
  // 软校验：点赞远大于播放通常意味着字段映射错了
  if (Number.isFinite(m.plays) && Number.isFinite(m.likes) && m.plays > 0 && m.likes > m.plays * 3) {
    e.push('点赞数超过播放数 3 倍，疑似字段对应错位');
  }
  if (c.durationSec != null && (!Number.isFinite(c.durationSec) || c.durationSec <= 0 || c.durationSec > 3600)) {
    e.push(`时长非法: ${c.durationSec}`);
  }
  if (m.completion != null && (!Number.isFinite(m.completion) || m.completion < 0 || m.completion > 1)) {
    e.push(`完播率非法: ${m.completion}（应 0–1）`);
  }
  return e;
}

/** 校验一批，返回通过的和被拒的（带原因），用于日志与后续排查 */
export function validateBatch({ accounts = [], contents = [] }) {
  const okAccounts = [];
  const badAccounts = [];
  for (const a of accounts) {
    const e = validateAccount(a);
    e.length ? badAccounts.push({ item: a, errors: e }) : okAccounts.push(a);
  }
  const okContents = [];
  const badContents = [];
  for (const c of contents) {
    const e = validateContent(c);
    e.length ? badContents.push({ item: c, errors: e }) : okContents.push(c);
  }
  return { okAccounts, badAccounts, okContents, badContents };
}
