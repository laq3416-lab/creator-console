import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getBenchmarkById, getRhythm, getBenchmarkRows, getContents } from '@/db/queries';
import { fmt, relTime } from '@/lib/format';
import { buildTakeaway } from './actions';
import { hasLlmKey } from '@/lib/llm';

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

  const mine = getContents().filter((c) => (c.plays ?? 0) >= 100);
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
        {b.url ? <a href={b.url} target="_blank" rel="noopener noreferrer" className="btn">打开抖音原视频 ↗</a> : <span className="sync-note">暂无可用原视频链接</span>}
      </div>

      <div className="card" style={{ padding: 22 }}>
        <div style={{ fontSize: 20, fontWeight: 680, letterSpacing: '-0.3px', lineHeight: 1.4 }}>
          {b.title}
        </div>
        <div style={{ marginTop: 8, fontSize: 12.5, color: 'var(--text3)', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <span>{b.handle}</span>
          <span>{fmt(b.followerCount)} 粉</span>
          {duration && <span>{duration} 秒</span>}
          <span>{b.publishedAt > 0 ? relTime(b.publishedAt) : '发布时间未知'}</span>
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
              ? '比你的均长短至少三成，不能据此判断高赞原因'
              : duration && myAvgDuration ? '时长相近或更长，不能单凭时长判断表现' : '缺少时长数据，暂无法比较'}
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
                  : '画面切换较少，不能据此判断留存原因'
              : '跑 npm run video 会分析'}
          </div>
        </div>
        <div className="cmp-row">
          <div className="cmp-dim">前 3 秒</div>
          <div className="cmp-v">{rhythm ? `${rhythm.first3sCuts} 刀` : '未分析'}</div>
          <div className="cmp-v" style={{ color: 'var(--text2)' }}>开头有没有画面变化</div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>
            {rhythm ? (rhythm.first3sCuts > 0 ? '检测到画面切换' : '未检测到画面切换') : '尚未检测，无法判断开头'}
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
              ? '评论数相对点赞较多，原因需要结合内容核实'
              : '评论数相对点赞较少，无法仅凭比例判断原因'}
          </div>
        </div>
      </div>

      <div className="sec-head">
        <h2>能借鉴的点</h2>
        <span className="hint">只给结构，不给文案</span>
        {points.length === 0 && hasLlmKey() && (
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
          {hasLlmKey() ? '还没有模型拆解。点击「让模型拆解」，基于已采集指标生成可参考的建议；模型未观看视频，具体内容请打开原视频核实。' : '还没有模型拆解。配置模型 API Key 后可生成建议；也可以先打开原视频自行查看。'}
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
        ✦ 模型建议基于已采集的数字，未必反映视频实际内容，请对照原视频核实。
      </div>
    </>
  );
}
