import { getSuggestions, getContents, getVideoComparison, getRadarSuggestionTarget } from '@/db/queries';
import { relTime, fmt, median, interRate, MIN_SAMPLE } from '@/lib/format';
import EmptyState from '@/components/EmptyState';
import Evidence from '@/components/Evidence';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function AdvisorPage() {
  const all = getSuggestions(10);
  const contents = getContents();
  const vc = getVideoComparison();

  const withStats = contents.filter((c) => c.plays >= MIN_SAMPLE);
  const byPlays = [...withStats].sort((a, b) => b.plays - a.plays);
  const best = byPlays[0];
  const worst = byPlays[byPlays.length - 1];
  const medCompletion = median(
    withStats.map((c) => c.completion).filter((v): v is number => v != null),
  );
  const avgDuration = median(
    withStats.map((c) => c.durationSec).filter((v): v is number => v != null),
  );
  const recentCount = contents.filter((c) => Date.now() - c.publishedAt < 30 * 86400000).length;
  const cards = all.slice(0, 6);

  if (all.length === 0) {
    return (
      <>
        <EmptyState
          icon="✦"
          title="还没有产出任何建议"
          desc="建议是从指标里算出来的，没有数据就没有结论。规则引擎会先跑起来（阈值可调），大模型复盘等指标攒够 7 天再开。"
          steps={[
            '接入数据后，规则引擎先对单条指标做实时判断',
            '攒满 7 天，再让模型做趋势和结构性归因',
            '所有建议都带证据链，不可解释的不出',
          ]}
          cta="等待数据接入"
        />
        <div className="note">
          ✦ 规则负责「哪条出事了」，模型负责「为什么、下一步做什么」。两条链路都还没跑，所以这里不编内容。
        </div>
      </>
    );
  }

  return (
    <>
      <div className="grid g3">
        {cards.map((s) => {
          const target = getRadarSuggestionTarget(s);
          return (
          <div className="card sugg" key={s.id}>
            <div className="sugg-head">
              <span
                className="tag"
                style={{
                  color: `var(--${s.severity === 'red' ? 'red' : s.severity === 'amber' ? 'amber' : 'green'})`,
                  background: `var(--${s.severity === 'red' ? 'red' : s.severity === 'amber' ? 'amber' : 'green'}-bg)`,
                }}
              >
                {s.tag}
              </span>
              <span className="conf">
                {s.source === 'llm' ? 'AI' : s.source === 'radar' ? '爆款雷达' : '规则'} · {relTime(s.createdAt)}
              </span>
            </div>
            <h3>{s.title}</h3>
            <p>{s.rationale}</p>
            <Evidence raw={s.evidence} />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <span
                style={{
                  fontSize: 11.5,
                  padding: '4px 9px',
                  borderRadius: 6,
                  background: 'var(--surface2)',
                  border: '1px solid var(--border)',
                  color: 'var(--text2)',
                }}
              >
                {s.action}
              </span>
            </div>
            {target ? <Link className="sugg-detail-cta" href={`/bench/${encodeURIComponent(target)}`}>查看作品详情与分析 →</Link> : s.source === 'radar' ? <div className="sync-note">原作品记录不可用</div> : null}
          </div>
        ); })}
      </div>

      <div className="sec-head">
        <h2>数据快照</h2>
        <span className="hint">从真实指标算出来的事实，不是模型写的</span>
      </div>
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <div
              style={{ fontSize: 11, color: 'var(--text3)', letterSpacing: 0.5, marginBottom: 8 }}
            >
              表现最好 / 最该复盘
            </div>
            {best ? (
              <ul
                style={{
                  listStyle: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  fontSize: 12.5,
                  color: 'var(--text2)',
                  lineHeight: 1.6,
                }}
              >
                <li>
                  <b style={{ color: 'var(--green)' }}>▲ {best.title.slice(0, 22)}</b>
                  <br />
                  播放 {fmt(best.plays)} · 互动率 {interRate(best.likes, best.plays).toFixed(1)}%
                  {best.completion != null && ` · 完播 ${(best.completion * 100).toFixed(2)}%`}
                </li>
                {worst && worst.id !== best.id && (
                  <li>
                    <b style={{ color: 'var(--red)' }}>▼ {worst.title.slice(0, 22)}</b>
                    <br />
                    播放 {fmt(worst.plays)} · 互动率 {interRate(worst.likes, worst.plays).toFixed(1)}%
                    {worst.completion != null && ` · 完播 ${(worst.completion * 100).toFixed(2)}%`}
                  </li>
                )}
              </ul>
            ) : (
              <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>
                还没有播放量 ≥ {MIN_SAMPLE} 的作品，暂不做排名。
              </div>
            )}
          </div>

          <div>
            <div
              style={{ fontSize: 11, color: 'var(--text3)', letterSpacing: 0.5, marginBottom: 8 }}
            >
              整体水位
            </div>
            <ul
              style={{
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
                fontSize: 12.5,
                color: 'var(--text2)',
                lineHeight: 1.6,
              }}
            >
              <li>
                有效样本 <b>{withStats.length}</b> 条（播放 ≥ {MIN_SAMPLE}）
              </li>
              <li>
                完播率中位{' '}
                <b>{medCompletion != null ? `${(medCompletion * 100).toFixed(2)}%` : '—'}</b>
                <span style={{ color: 'var(--text3)' }}>　短视频参考线 20–30%</span>
              </li>
              <li>
                时长中位 <b>{avgDuration ? `${Math.round(avgDuration)} 秒` : '—'}</b>
                <span style={{ color: 'var(--text3)' }}>　越长完播越难</span>
              </li>
              <li>
                近 30 天发布 <b>{recentCount}</b> 条
              </li>
            </ul>
          </div>
        </div>
      </div>

      <div className="sec-head">
        <h2>镜头节奏</h2>
        <span className="hint">
          用 ffmpeg 场景检测算出来的，不是猜的（我的 {vc.mineCount} 条 / 同行 {vc.peerCount} 条）
        </span>
      </div>
      <div className="card">
        {vc.mine.cutsPerSec == null || vc.peer.cutsPerSec == null ? (
          <div className="empty-sm" style={{ padding: '28px 20px' }}>
            视频结构还没分析。跑一次 <code>npm run video</code>，会给每条视频算镜头切换频率。
          </div>
        ) : (
          <>
            <div className="cmp-row cmp-head">
              <div>维度</div>
              <div>我的视频</div>
              <div>同行爆款</div>
              <div>判定</div>
            </div>
            {[
              {
                d: '平均镜头时长',
                mine: `${vc.mine.avgShotSec?.toFixed(0)} 秒`,
                peer: `${vc.peer.avgShotSec?.toFixed(0)} 秒`,
                bad: (vc.mine.avgShotSec ?? 0) > (vc.peer.avgShotSec ?? 1) * 1.5,
                v:
                  (vc.mine.avgShotSec ?? 0) > (vc.peer.avgShotSec ?? 1) * 1.5
                    ? `慢 ${((vc.mine.avgShotSec ?? 0) / (vc.peer.avgShotSec ?? 1)).toFixed(1)}×`
                    : '接近',
              },
              {
                d: '每秒切镜',
                mine: `${vc.mine.cutsPerSec?.toFixed(2)} 刀`,
                peer: `${vc.peer.cutsPerSec?.toFixed(2)} 刀`,
                bad: (vc.mine.cutsPerSec ?? 0) < (vc.peer.cutsPerSec ?? 1) * 0.7,
                v:
                  (vc.mine.cutsPerSec ?? 0) < (vc.peer.cutsPerSec ?? 1) * 0.7
                    ? '偏静'
                    : '接近',
              },
              {
                d: '前 3 秒切镜',
                mine: `${vc.mine.first3sCuts?.toFixed(1)} 刀`,
                peer: `${vc.peer.first3sCuts?.toFixed(1)} 刀`,
                bad: (vc.mine.first3sCuts ?? 0) < (vc.peer.first3sCuts ?? 0),
                v: (vc.mine.first3sCuts ?? 0) < (vc.peer.first3sCuts ?? 0) ? '偏少' : '达标',
              },
            ].map((g) => (
              <div className="cmp-row" key={g.d}>
                <div className="cmp-dim">{g.d}</div>
                <div className="cmp-v">{g.mine}</div>
                <div className="cmp-v" style={{ color: 'var(--text2)' }}>
                  {g.peer}
                </div>
                <div>
                  <span className={`verdict ${g.bad ? 'v-bad' : 'v-ok'}`}>{g.v}</span>
                </div>
              </div>
            ))}
            <div className="dir-item" style={{ borderTop: '1px solid var(--border)' }}>
              <div className="dir-k">怎么改</div>
              <div className="dir-v">
                同一句话用两个画面拍，每 8–10 秒换一次景别或机位；开头 3 秒至少给一次画面变化。
                {vc.staticOnes.length > 0 && (
                  <>
                    {' '}
                    你有 <b>{vc.staticOnes.length} 条</b>全程一个镜头没切，先从这些改。
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="note">
        ✦ 上面这些全部是从指标算出来的，没有一条是编的。规则引擎负责「哪条出事了」，
        大模型接上之后才负责「为什么、下一步做什么」——现在还不写这部分。
      </div>
    </>
  );
}
