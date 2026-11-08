export type Platform = 'douyin' | 'xhs' | 'xianyu';

export const PLATFORMS: Record<Platform, { name: string; short: string; cssVar: string }> = {
  douyin: { name: '抖音', short: '抖', cssVar: '--dy' },
  xhs: { name: '小红书', short: '小', cssVar: '--xhs' },
  xianyu: { name: '闲鱼', short: '闲', cssVar: '--xy' },
};

export function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 10000) {
    return (n / 10000).toFixed(1).replace(/\.0$/, '') + '万';
  }
  return n.toLocaleString('zh-CN');
}

/** 超额系数：播放 ÷ 粉丝数。小号做出大播放才是真本事。 */
export function overIndex(plays: number, fans: number): number {
  if (!fans) return 0;
  return plays / fans;
}

export function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(ts).toLocaleDateString('zh-CN');
}

export function shortDate(ts: number): string {
  const d = new Date(ts);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${mm}-${dd}`;
}

export function clockTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function interRate(likes: number | null, plays: number | null): number | null {
  if (likes == null || plays == null || plays <= 0) return null;
  return (likes / plays) * 100;
}

/**
 * 诊断判定必须看样本量。
 * 10 次播放 3 个赞 = 30% 互动率，这不是爆款，是噪声。
 * 低于 MIN_SAMPLE 一律判「样本不足」，不参与任何结论。
 */
export const MIN_SAMPLE = 100;

export type Verdict = { label: string; tone: 'red' | 'green' | 'muted' };

export function diagnose(plays: number | null, rate: number | null): Verdict {
  if (plays == null || rate == null) return { label: '无数据', tone: 'muted' };
  if (plays < MIN_SAMPLE) return { label: '样本不足', tone: 'muted' };
  if (rate < 3.5) return { label: '待优化', tone: 'red' };
  if (rate > 6) return { label: '可复用', tone: 'green' };
  return { label: '正常', tone: 'muted' };
}

export function rateText(plays: number | null, rate: number | null): string {
  if (plays == null || rate == null) return '—';
  if (plays < MIN_SAMPLE) return '—';
  return `${rate.toFixed(1)}%`;
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 聊天时间：今天显示 HH:mm，更早显示 月/日 HH:mm，跨年显示年份 */
export function chatTime(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  const sameDay =
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
  if (sameDay) return hm;
  if (d.getFullYear() !== now.getFullYear()) return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}
