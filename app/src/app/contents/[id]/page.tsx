import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getContentDetail } from '@/db/queries';
import { fmt, relTime, interRate, PLATFORMS, type Platform } from '@/lib/format';
import Evidence from '@/components/Evidence';

export const dynamic = 'force-dynamic';

export default async function ContentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = getContentDetail(id);
  if (!c) notFound();

  const plat = PLATFORMS[c.platform as Platform];
  const rate = interRate(c.stats.likes, c.stats.plays);

  const metrics: { label: string; value: string; hint?: string }[] = [
    { label: c.platform === 'xianyu' ? '浏览' : '播放', value: fmt(c.stats.plays) },
    { label: '点赞', value: fmt(c.stats.likes) },
    { label: '评论', value: fmt(c.stats.comments) },
    { label: '收藏', value: fmt(c.stats.saves) },
  ];

  const deep: { label: string; value: string; good?: boolean }[] = [];
  if (c.stats.completion != null)
    deep.push({
      label: '完播率',
      value: `${(c.stats.completion * 100).toFixed(2)}%`,
      good: c.stats.completion >= 0.2,
    });
  if (c.stats.completion5s != null)
    deep.push({ label: '5 秒完播', value: `${(c.stats.completion5s * 100).toFixed(1)}%` });
  if (c.stats.bounce2s != null)
    deep.push({
      label: '2 秒跳出',
      value: `${(c.stats.bounce2s * 100).toFixed(1)}%`,
      good: c.stats.bounce2s < 0.45,
    });
  if (c.stats.avgViewSec != null)
    deep.push({ label: '平均观看', value: `${c.stats.avgViewSec.toFixed(1)} 秒` });

  return (
    <>
      <div className="toolbar">
        <Link href="/contents" className="chip">
          ← 返回作品库
        </Link>
        <div style={{ flex: 1 }} />
        {c.url && (
          <a href={c.url} target="_blank" rel="noreferrer" className="btn">
            打开{plat.name}原作品 ↗
          </a>
        )}
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div style={{ fontSize: 19, fontWeight: 680, lineHeight: 1.45, letterSpacing: '-0.2px' }}>
          {c.title}
        </div>
        <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span>{plat.name}</span>
          <span>{c.type === 'video' ? '视频' : c.type === 'note' ? '图文' : '商品'}</span>
          {c.durationSec ? <span>{c.durationSec} 秒</span> : null}
          <span>{relTime(c.publishedAt)}</span>
          <span>互动率 {c.stats.plays ? `${rate.toFixed(1)}%` : '—'}</span>
        </div>
      </div>

      <div className="grid g4" style={{ marginTop: 12 }}>
        {metrics.map((m) => (
          <div className="card kpi" key={m.label}>
            <div className="kpi-label">{m.label}</div>
            <div className="kpi-value" style={{ fontSize: 22 }}>
              {m.value}
            </div>
          </div>
        ))}
      </div>

      {deep.length > 0 && (
        <>
          <div className="sec-head">
            <h2>深度指标</h2>
            <span className="hint">只有创作者后台才有，公开页看不到</span>
          </div>
          <div className="card">
            {deep.map((d) => (
              <div className="cmp-row" key={d.label} style={{ gridTemplateColumns: '160px 1fr' }}>
                <div className="cmp-dim">{d.label}</div>
                <div className="cmp-v" style={{ color: d.good === false ? 'var(--red)' : d.good ? 'var(--green)' : undefined }}>
                  {d.value}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {c.rhythm && (
        <>
          <div className="sec-head">
            <h2>镜头节奏</h2>
            <span className="hint">ffmpeg 场景检测</span>
          </div>
          <div className="card">
            <div className="cmp-row" style={{ gridTemplateColumns: '160px 1fr 1fr' }}>
              <div className="cmp-dim">镜头切换</div>
              <div className="cmp-v">{c.rhythm.cuts} 刀</div>
              <div className="cmp-v" style={{ color: 'var(--text2)' }}>
                {c.rhythm.cutsPerSec.toFixed(2)} 刀/秒
              </div>
            </div>
            <div className="cmp-row" style={{ gridTemplateColumns: '160px 1fr 1fr' }}>
              <div className="cmp-dim">平均镜头</div>
              <div className="cmp-v">{c.rhythm.avgShotSec.toFixed(1)} 秒</div>
              <div className="cmp-v" style={{ color: 'var(--text3)' }}>
                {c.rhythm.avgShotSec > 20 ? '偏静态' : '节奏正常'}
              </div>
            </div>
            <div className="cmp-row" style={{ gridTemplateColumns: '160px 1fr 1fr' }}>
              <div className="cmp-dim">前 3 秒</div>
              <div className="cmp-v">{c.rhythm.first3sCuts} 刀</div>
              <div className="cmp-v" style={{ color: 'var(--text3)' }}>
                {c.rhythm.first3sCuts === 0 ? '开头没有画面变化' : '开头有变化'}
              </div>
            </div>
          </div>
        </>
      )}

      {c.related.length > 0 && (
        <>
          <div className="sec-head">
            <h2>相关建议</h2>
            <span className="hint">{c.related.length} 条</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {c.related.map((s) => (
              <div className="card" key={s.id} style={{ padding: '16px 20px' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span
                    className="tag"
                    style={{
                      color: `var(--${s.severity === 'red' ? 'red' : s.severity === 'amber' ? 'amber' : 'green'})`,
                      background: `var(--${s.severity === 'red' ? 'red' : s.severity === 'amber' ? 'amber' : 'green'}-bg)`,
                    }}
                  >
                    {s.tag}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>{relTime(s.createdAt)}</span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 620 }}>{s.title}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 5, lineHeight: 1.6 }}>
                  {s.rationale}
                </div>
                <Evidence raw={s.evidence} />
                <div className="alert-act" style={{ marginTop: 8 }}>
                  {s.action} →
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="note">
        ✦ 外链打开的是平台原页面。抖音/小红书的视频正文无法内嵌（跨域 + 防盗链），
        所以这里给的是跳转；指标和结构分析才是本工具的价值。
      </div>
    </>
  );
}
