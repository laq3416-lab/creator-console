/**
 * 抖音响应解析：把创作者后台的原始 JSON 归一化成我们自己的结构。
 * 单独放在这里，是为了能用录制下来的真实响应离线跑测试，不用每次开浏览器。
 */


export function num(v) {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function parseAccount(userJson, workCount) {
  const v = userJson?.douyin_user_verify_info;
  if (!v) throw new Error('user/info 里找不到 douyin_user_verify_info');
  return {
    id: `acc_douyin_${v.douyin_unique_id}`,
    platform: 'douyin',
    handle: `@${v.nick_name}`,
    nickname: v.nick_name,
    avatarUrl: v.avatar_url ?? null,
    followerCount: v.follower_count,
    workCount,
    avatarUrl: v.avatar_url,
    syncedAt: Date.now(),
  };
}

export function parseWorks(worklist, accId) {
  const items = worklist?.items ?? [];
  const awemes = worklist?.aweme_list ?? [];
  // items[].id 是数字、已丢精度；aweme_list[].aweme_id 是字符串、精确。
  // 两边转成同一个 double 再对齐，才拿得到 metrics。
  const byId = new Map(items.map((it) => [String(it.id), it]));

  return awemes.map((a) => {
    const it = byId.get(String(Number(a.aweme_id)));
    const m = it?.metrics ?? {};
    const metrics = {
      plays: num(m.view_count),
      likes: num(m.like_count),
      comments: num(m.comment_count),
      saves: num(m.favorite_count),
      shares: num(m.share_count),
      completion: num(m.completion_rate),
      completion_5s: num(m.completion_rate_5s),
      avg_view_sec: num(m.avg_view_second),
      bounce_2s: num(m.bounce_rate_2s),
      homepage_visits: num(m.homepage_visit_count),
      fans_gained: num(m.subscribe_count),
      fans_lost: num(m.unsubscribe_count),
    };
    // 去掉解不出来的字段，避免把 undefined 写进库
    for (const k of Object.keys(metrics)) if (metrics[k] === undefined) delete metrics[k];

    return {
      platform: 'douyin',
      accountId: accId,
      externalId: String(a.aweme_id),
      type: 'video',
      title: (a.item_title || a.desc || '（无标题）').split('\n')[0].trim().slice(0, 200),
      publishedAt: (a.create_time ?? 0) * 1000,
      url: `https://www.douyin.com/video/${a.aweme_id}`,
      durationSec: Math.round(((a.duration ?? it?.video_info?.duration ?? 0) || 0) / 1000) || null,
      // 签名播放地址，几小时后过期，所以要采集时立刻分析
      videoUrl: a.video?.play_addr?.url_list?.[0] ?? a.video?.play_addr_h264?.url_list?.[0] ?? null,
      metrics,
    };
  });
}

/**
 * 概览接口返回的是「每日增量」，且增量之和与账号真实粉丝数对不上
 * （实测 7 天涨粉合计 19，但账号总粉丝只有 7，取关数还是 0）。
 * 这种数据不能反推累计曲线——算出来是负数。
 * 所以：涨粉按日增量如实存；粉丝总数只存当前一个点。
 */
export function parseOverview(overview, accId, totalFans) {
  const d = overview?.data ?? {};
  const keyMap = {
    play: 'plays',
    digg: 'likes',
    comment: 'comments',
    share: 'shares',
    profile: 'profile_views',
    fans: 'fans_gain',
    new_fans: 'new_fans',
    cancel_fans: 'cancel_fans',
  };

  const seen = new Set();
  const series = [];

  for (const [rawKey, mapped] of Object.entries(keyMap)) {
    const block = d[rawKey];
    if (!block?.option_list) continue;
    for (const o of block.option_list) {
      const at = Date.parse(`${o.date}T00:00:00+08:00`);
      const v = num(o.count);
      if (!Number.isFinite(at) || v === undefined) continue;
      const dedupe = `${mapped}@${o.date}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      series.push({ entityId: accId, key: mapped, value: v, capturedAt: at });
    }
  }

  // 粉丝总数：只有当前值可靠，存单点。前端拿到单点会渲染成「—」，不会画假曲线。
  if (Number.isFinite(totalFans)) {
    series.push({ entityId: accId, key: 'fans', value: totalFans, capturedAt: Date.now() });
  }

  return series;
}
