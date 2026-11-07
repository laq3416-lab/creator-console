/**
 * 小红书响应解析。
 * 字段来源：2026-11 实测录制（data/spy/xhs/raw）。
 */

export function num(v) {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function parseAccount(userJson) {
  const d = userJson?.data ?? {};
  return {
    id: `acc_xhs_${d.userId}`,
    platform: 'xhs',
    handle: `@${d.userName}`,
    nickname: d.userName,
    avatarUrl: d.userAvatar ?? null,
    // 创作者后台不返回粉丝总数，只有涨跌；先用 0，后续从公开主页补
    followerCount: num(d.fansCount) ?? num(d.fans_count) ?? 0,
    workCount: 0,
    syncedAt: Date.now(),
  };
}

/** 账号级每日序列：曝光/浏览/点赞/收藏/评论/分享/涨粉/封面点击率 */
export function parseAccountSeries(baseJson, accId) {
  const seven = baseJson?.data?.seven ?? {};
  const MAP = {
    impl_count_list: 'exposure',
    view_list: 'plays',
    like_list: 'likes',
    collect_list: 'saves',
    comment_list: 'comments',
    share_list: 'shares',
    net_rise_fans_count_list: 'fans_gain',
    home_view_list: 'profile_views',
  };

  const series = [];
  for (const [src, key] of Object.entries(MAP)) {
    for (const item of seven[src] ?? []) {
      const at = num(item.date);
      // 注意：count_with_double 常为 0，不能用 ?? 回退（0 不是 nullish）
      const v = num(item.count) ?? num(item.count_with_double);
      if (!Number.isFinite(at) || v === undefined) continue;
      series.push({ entityId: accId, key, value: v, capturedAt: at });
    }
  }
  return series;
}

/** 笔记列表 → 作品 */
export function parseNotes(postedJson, accId) {
  const notes = postedJson?.data?.notes ?? [];
  return notes.map((n) => {
    const at = n.visible_time ? n.visible_time * 1000 : Date.parse((n.time ?? '').replace(/-/g, '/'));
    return {
      platform: 'xhs',
      accountId: accId,
      externalId: String(n.id),
      type: n.type === 'video' ? 'video' : 'note',
      title: String(n.display_title ?? '（无标题）').slice(0, 200),
      publishedAt: Number.isFinite(at) ? at : Date.now(),
      durationSec: null,
      url: `https://www.xiaohongshu.com/explore/${n.id}`,
      metrics: {
        plays: num(n.view_count),
        likes: num(n.likes),
        comments: num(n.comments_count),
        saves: num(n.collected_count),
        shares: num(n.shared_count),
      },
    };
  });
}
