import { PLATFORMS, type Platform } from '@/lib/format';

/* 全部用 inline style + CSS 变量取色，主题切换时不需要重渲染图表 */

export function Sparkline({
  data,
  color = 'var(--accent)',
  w = 62,
  h = 20,
}: {
  data?: number[];
  color?: string;
  w?: number;
  h?: number;
}) {
  if (!data || data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * (w - 2) + 1,
    h - 3 - ((v - min) / span) * (h - 6),
  ]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <path d={d} style={{ stroke: color }} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function AreaChart({
  data,
  labels,
  color = 'var(--dy)',
  w = 520,
  h = 150,
}: {
  data: number[];
  labels: string[];
  color?: string;
  w?: number;
  h?: number;
}) {
  if (!data || data.length < 2) return null;

  // 自适应区间：用 0 做基线会把缓涨的曲线压成一条直线
  const lo = Math.min(...data);
  const hi = Math.max(...data);
  const pad = ((hi - lo) || Math.abs(hi) * 0.1 || 1) * 0.45;
  const min = lo - pad;
  const max = hi + pad;

  const px = (i: number) => 8 + (i / (data.length - 1)) * (w - 16);
  const py = (v: number) => h - 22 - ((v - min) / (max - min)) * (h - 40);

  const line = data.map((v, i) => `${i ? 'L' : 'M'}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(' ');
  const area = `${line} L${px(data.length - 1).toFixed(1)} ${h - 22} L${px(0).toFixed(1)} ${h - 22} Z`;
  const gid = 'g' + Math.abs(hash(color));

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: color, stopOpacity: 0.22 }} />
          <stop offset="100%" style={{ stopColor: color, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map((i) => (
        <line key={i} x1={8} y1={14 + i * ((h - 40) / 3)} x2={w - 8} y2={14 + i * ((h - 40) / 3)}
          style={{ stroke: 'var(--grid)' }} strokeWidth={1} />
      ))}
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} style={{ stroke: color }} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((v, i) => (
        <circle key={i} cx={px(i)} cy={py(v).toFixed(1)} r={2.6}
          style={{ fill: 'var(--surface)', stroke: color }} strokeWidth={1.8} />
      ))}
      {labels.map((lb, i) => (
        <text key={i} x={px(i)} y={h - 6} textAnchor="middle"
          style={{ fill: 'var(--text3)', fontFamily: 'var(--mono)' }} fontSize={10}>
          {lb}
        </text>
      ))}
    </svg>
  );
}

export function PlatBadge({ platform, size = 30 }: { platform: Platform; size?: number }) {
  const p = PLATFORMS[platform];
  return (
    <div
      className="plat"
      style={{
        width: size,
        height: size,
        flexBasis: size,
        fontSize: size < 32 ? 11 : 12,
        color: `var(${p.cssVar})`,
        background: `color-mix(in srgb, var(${p.cssVar}) 16%, transparent)`,
      }}
    >
      {p.short}
    </div>
  );
}

export function MiniBars({ data, height = 22 }: { data: number[]; height?: number }) {
  const max = Math.max(...data, 1);
  return (
    <div className="mini-bars" style={{ height }}>
      {data.map((v, i) => (
        <i key={i} className={v > max * 0.7 ? 'hot' : ''}
          style={{ height: Math.max(3, Math.sqrt(v / max) * height) }} />
      ))}
    </div>
  );
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}
