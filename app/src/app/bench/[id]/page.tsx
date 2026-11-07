import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBenchmarkById, getRhythm, getBenchmarkRows, getContents } from '@/db/queries';
import { fmt, relTime } from '@/lib/format';
import { buildTakeaway } from './actions';

export const dynamic = 'force-dynamic';

type Point = { what: string; how: string; why: string };

export default async function BenchDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = getBenchmarkById(id);
  if (!b) notFound();

  const rhythm = getRhythm('benchmark', id);
  // 列表接口没给时长时，用 ffprobe 分析出来的补上
  const duration = b.durationSec ?? (rhythm ? Math.round(rhythm.durationSec) : null);
  const peers = getBenchmarkRows('peer');
  const rank = peers.findIndex((p) => p.id === id) + 1;

  const mine = getContents().filter((c) => c.plays >= 100);
  const myAvgDuration = mine.length
    ? Math.round(mine.reduce((s, c) => s + (c.durationSec ?? 0), 0) / mine.length)
    : null;

  let points: Point[] = [];
  try {
    points = b.takeaway ? JSON.parse(b.takeaway) : [];
  } catch {
    points = [];
  }

  return (
    <>
      <div className="toolbar">
        <Link href="/bench" className="chip">
          ← 返回爆款雷达
        </Link>
        <div style={{ flex: 1 }} />
        <a href={b.url} target="_blank" rel="noreferrer" className="btn">
          打开抖音原视频 ↗
        </a>
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div style={{ fontSize: 20, fontWeight: 680, letterSpacing: '-0.3px', lineHeight: 1.4 }}>
          {b.title}
        </div>
        <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span>{b.handle}</span>
          <span>{fmt(b.followerCount)} 粉</span>
          {duration && <span>{duration} 秒</span>}
          <span>{relTime(b.publishedAt)}</span>
          {rank > 0 && <span>同级榜单第 {rank} 名</span>}
        </div>
        {b.tagList.length > 0 && (
          <div className="bk-tags" style={{ marginTop: 10 }}>
            {b.tagList.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        )}
      </div>

      <div className="grid g4" style={{ marginTop: 12 }}>
        {[
          { l: '点赞', v: fmt(b.likes) },
          { l: '评论', v: fmt(b.comments) },
          { l: '收藏', v: fmt(b.saves) },
          { l: '赞粉比', v: `${b.ratio.toFixed(1)}×` },
        ].map((k) => (
          <div className="card kpi" key={k.l}>
            <div className="kpi-label">{k.l}</div>
            <div className="kpi-value" style={{ fontSize: 22 }}>
              {k.v}
            </div>
          </div>
        ))}
      </div>

      <div className="sec-head">
        <h2>结构数据</h2>
        <span className="hint">镜头数据来自 ffmpeg 场景检测；没分析过的视频这里是空的</span>
      </div>
      <div className="card">
        <div className="cmp-row cmp-head">
          <div>维度</div>
          <div>这条爆款</div>
          <div>参考</div>
          <div>说明</div>
        </div>
        <div className="cmp-row">
          <div className="cmp-dim">视频时长</div>
          <div className="cmp-v">{duration ? `${duration} 秒` : '—'}</div>
          <div className="cmp-v" style={{ color: 'var(--text2)' }}>
            我的均长 {myAvgDuration ? `${myAvgDuration} 秒` : '—'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
            {duration && myAvgDuration && duration < myAvgDuration * 0.7
              ? '明显更短，短时长是高赞的常见共性'
              : '时长不是决定因素'}
          </div>
        </div>
        <div className="cmp-row">
          <div className="cmp-dim">镜头切换</div>
          <div className="cmp-v">{rhythm ? `${rhythm.cuts} 刀 / ${rhythm.cutsPerSec.toFixed(2)} 刀每秒` : '未分析'}</div>
          <div className="cmp-v" style={{ color: 'var(--text2)' }}>
            {rhythm ? `平均 ${rhythm.avgShotSec.toFixed(1)} 秒一镜` : '—'}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
            {rhythm
              ? rhythm.cutsPerSec > 0.2
                ? '剪辑密度高，画面一直在变'
                : rhythm.cutsPerSec > 0.08
                  ? '中等节奏'
                  : '偏静态，靠内容本身留人'
              : '跑 npm run video 会分析'}
          </div>
        </div>
        <div className="cmp-row">
          <div className="cmp-dim">前 3 秒</div>
          <div className="cmp-v">{rhythm ? `${rhythm.first3sCuts} 刀` : '未分析'}</div>
          <div className="cmp-v" style={{ color: 'var(--text2)' }}>开头有没有画面变化</div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
            {rhythm && rhythm.first3sCuts > 0 ? '开头就给了刺激' : '开头靠一句话撑住'}
          </div>
        </div>
        <div className="cmp-row">
          <div className="cmp-dim">评论 / 点赞</div>
          <div className="cmp-v">
            {((b.comments / Math.max(b.likes, 1)) * 100).toFixed(2)}%
          </div>
          <div className="cmp-v" style={{ color: 'var(--text2)' }}>
            评论 {fmt(b.comments)} / 赞 {fmt(b.likes)}
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
            {b.comments / Math.max(b.likes, 1) > 0.05
              ? '评论占比高，说明有争议或强提问'
              : '看的人多、说话的人少，评论区没有被撬动'}
          </div>
        </div>
      </div>

      <div className="sec-head">
        <h2>能借鉴的点</h2>
        <span className="hint">只给结构，不给文案</span>
        {points.length === 0 && (
          <form action={buildTakeaway} style={{ marginLeft: 'auto' }}>
            <input type="hidden" name="id" value={b.id} />
            <button className="btn ghost" type="submit">
              让模型拆解
            </button>
          </form>
        )}
      </div>

      {points.length === 0 ? (
        <div className="card empty-sm" style={{ padding: '36px 20px', lineHeight: 1.8 }}>
          还没拆解过。点右上角「让模型拆解」，它会基于上面的真实数据给出 4 条结构动作。
        </div>
      ) : (
        <div className="card">
          {points.map((p, i) => (
            <div className="dir-item" key={i}>
              <div className="dir-k">0{i + 1}</div>
              <div className="dir-v">
                <b>{p.what}</b>
                <div style={{ marginTop: 4 }}>{p.how}</div>
                <div style={{ marginTop: 5, fontSize: 11, color: 'var(--text3)' }}>依据：{p.why}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="note">
        ✦ 结构可以学，文案不能抄。这里的每条都只描述「怎么组织」，不提供原句。
      </div>
    </>
  );
}
