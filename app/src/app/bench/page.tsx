import Link from 'next/link';
import { getBenchmarkRows, getBenchmarkMedian, getContents, getAccounts } from '@/db/queries';
import { fmt, relTime } from '@/lib/format';
import type { Platform } from '@/lib/format';
import EmptyState from '@/components/EmptyState';

export const dynamic = 'force-dynamic';

type Tab = 'peer' | 'head' | 'self';

const TABS: { key: Tab; label: string; star?: boolean }[] = [
  { key: 'peer', label: '同级对标', star: true },
  { key: 'head', label: '赛道头部' },
  { key: 'self', label: '我的作品' },
];

const COVERS = [
  'linear-gradient(150deg,#2b5d7a,#101a24)',
  'linear-gradient(150deg,#6b4a2f,#1a1208)',
  'linear-gradient(150deg,#3a5f3a,#0c160c)',
  'linear-gradient(150deg,#6a3346,#180a10)',
  'linear-gradient(150deg,#3f4468,#0e1020)',
];

export default async function BenchPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; all?: string; p?: string }>;
}) {
  const sp = await searchParams;
  const showAll = sp.all === '1';
  const pf = sp.p ?? 'all';
  const tab: Tab = (['peer', 'head', 'self'] as const).includes(sp.tab as Tab)
    ? (sp.tab as Tab)
    : 'peer';

  const peerRows = getBenchmarkRows('peer');
  const headRows = getBenchmarkRows('head');
  const smallRows = getBenchmarkRows('small');
  const median = getBenchmarkMedian('peer');

  const accounts = getAccounts();
  const myFans = accounts.reduce((s, a) => s + a.followerCount, 0);
  const myContents = getContents().filter((c) => c.plays >= 100);
  const myBest = [...myContents].sort((a, b) => b.likes - a.likes)[0];

  // 「我的作品」这一栏直接用自己库里的数据，不用对标表
  const mineRows = [...myContents]
    .sort((a, b) => b.likes - a.likes)
    .map((c) => ({
      id: c.id,
      title: c.title,
      platform: c.platform as Platform,
      handle: accounts[0]?.handle ?? '我',
      followerCount: myFans,
      plays: c.plays,
      likes: c.likes,
      comments: c.comments,
      saves: c.saves,
      durationSec: c.durationSec,
      publishedAt: c.publishedAt,
      tags: [] as string[],
      ratio: myFans ? c.likes / myFans : c.likes,
      ratioBasis: (myFans ? 'likes' : 'likes-abs') as 'likes' | 'likes-abs',
    }));

  const baseRows = tab === 'peer' ? peerRows : tab === 'head' ? headRows : mineRows;
  const rows = pf === 'all' ? baseRows : baseRows.filter((r) => r.platform === pf);
  const LIMIT = 12;
  const visible = showAll ? rows : rows.slice(0, LIMIT);

  if (peerRows.length === 0 && headRows.length === 0) {
    return (
      <EmptyState
        icon="◎"
        title="对标池还是空的"
        desc="爆款雷达靠关键词搜索抖音，把同赛道的作品抓回来。跑一次采集就会填满。"
        steps={[
          '自动搜索 AI工具 / AI Agent / vibe coding 等关键词',
          '抓回作品、作者粉丝数、点赞评论收藏',
          '按「赞粉比」排序 —— 小号做出大互动的才值得学',
        ]}
        cta="npm run radar"
      />
    );
  }

  const myRatio = myBest && myFans ? myBest.likes / myFans : 0;
  const myCommentPerFan = myBest && myFans ? myBest.comments / myFans : 0;

  const pct = (mine: number, bench: number) => {
    if (!bench) return 50;
    return Math.max(35, Math.min(92, Math.round((Math.abs(mine - bench) / bench) * 100)));
  };

  const gaps = median
    ? [
        {
          d: '赞粉比',
          mine: `${myRatio.toFixed(1)}×`,
          bench: `${(median.ratio ?? 0).toFixed(1)}×`,
          v: myRatio < (median.ratio ?? 0) ? `落后 ${((median.ratio ?? 0) / (myRatio || 1)).toFixed(1)}×` : '领先',
          bad: myRatio < (median.ratio ?? 0),
          w: pct(myRatio, median.ratio ?? 0),
          pending: false,
        },
        {
          d: '评论 / 粉丝',
          mine: `${myCommentPerFan.toFixed(2)}`,
          bench: `${(median.commentPerFan ?? 0).toFixed(2)}`,
          v: myCommentPerFan < (median.commentPerFan ?? 0) ? '偏低' : '达标',
          bad: myCommentPerFan < (median.commentPerFan ?? 0),
          w: pct(myCommentPerFan, median.commentPerFan ?? 0),
          pending: false,
        },
        {
          d: '视频时长',
          mine: myBest?.durationSec ? `${myBest.durationSec} 秒` : '—',
          bench: median.durationSec ? `${Math.round(median.durationSec)} 秒` : '—',
          v:
            myBest?.durationSec && median.durationSec && myBest.durationSec > median.durationSec
              ? `偏长 ${(myBest.durationSec / median.durationSec).toFixed(1)}×`
              : '达标',
          bad: Boolean(myBest?.durationSec && median.durationSec && myBest.durationSec > median.durationSec),
          w: myBest?.durationSec && median.durationSec ? pct(myBest.durationSec, median.durationSec) : 50,
          pending: false,
        },
        { d: '前 3 秒给结果', mine: '待采集', bench: '—', v: '未接入', bad: false, w: 0, pending: true },
        { d: '标题结构', mine: '待采集', bench: '—', v: '未接入', bad: false, w: 0, pending: true },
        { d: '结尾引导', mine: '待采集', bench: '—', v: '未接入', bad: false, w: 0, pending: true },
      ]
    : [];

  return (
    <>
      <div className="card statusbar" style={{ marginBottom: 14 }}>
        <span className="dot pulse" />
        <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>
          对标池 <b>{new Set([...peerRows, ...headRows].map((r) => r.handle)).size}</b> 个账号
          <span>（同级 {peerRows.length} / 头部 {headRows.length} / 小号 {smallRows.length} 条）</span>
        </div>
        <div style={{ flex: 1 }} />
        <span className="pill">来源：抖音搜索</span>
        <span className="pill">每日更新</span>
      </div>

      <div className="toolbar">
        {TABS.map((t) => (
          <Link key={t.key} href={`/bench?tab=${t.key}`} className={`chip${tab === t.key ? ' on' : ''}`}>
            {t.label}
            {t.star ? ' ★' : ''}
          </Link>
        ))}
        <span style={{ color: 'var(--text3)', margin: '0 6px' }}>|</span>
        {[
          ['all', '全平台'],
          ['douyin', '抖音'],
          ['xhs', '小红书'],
        ].map(([k, label]) => (
          <Link
            key={k}
            href={`/bench?tab=${tab}&p=${k}`}
            className={`chip${pf === k ? ' on' : ''}`}
            style={{ fontSize: 11 }}
          >
            {label}
          </Link>
        ))}
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>
          抖音看赞粉比，小红书搜索不返回粉丝数，改看绝对点赞
        </span>
      </div>

      <div className="card">
        {visible.map((r, i) => {
          const abs = r.ratioBasis === 'likes-abs';
          const cls = abs
            ? r.likes >= 10000
              ? 'ratio-hot'
              : r.likes >= 2000
                ? 'ratio-warm'
                : 'ratio-cool'
            : r.ratio >= 5
              ? 'ratio-hot'
              : r.ratio >= 2
                ? 'ratio-warm'
                : 'ratio-cool';
          return (
            <Link className="bk-row" key={r.id} href={`/bench/${r.id}`} style={{ cursor: 'pointer' }}>
              <span className={`bk-rank${i < 3 ? ' top' : ''}`}>
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="bk-cover" style={{ background: COVERS[i % COVERS.length] }}>
                ▶
              </div>
              <div className="bk-main">
                <div className="bk-title">{r.title}</div>
                <div className="bk-sub">
                  <span>{r.handle}</span>
                  {r.followerCount > 0 && <span>{fmt(r.followerCount)} 粉</span>}
                  {r.durationSec && <span>{r.durationSec} 秒</span>}
                  <span>{relTime(r.publishedAt)}</span>
                </div>
                <div className="bk-tags">
                  {r.tags.map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
              </div>
              <div className="bk-num">
                <b>{abs ? fmt(r.saves) : fmt(r.likes)}</b>
                <span>{abs ? '收藏' : '点赞'}</span>
              </div>
              <div className={`bk-ratio ${cls}`}>
                <b>{abs ? fmt(r.likes) : `${r.ratio.toFixed(1)}×`}</b>
                <span>{abs ? '点赞' : '赞粉比'}</span>
              </div>
              <span className="bk-go">›</span>
            </Link>
          );
        })}
        {rows.length === 0 && (
          <div style={{ padding: 32, color: 'var(--text3)' }}>该层级暂无数据</div>
        )}
        {rows.length > LIMIT && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', textAlign: 'center' }}>
            <Link
              href={`/bench?tab=${tab}${showAll ? '' : '&all=1'}`}
              style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}
            >
              {showAll ? '收起' : `显示全部 ${rows.length} 条`}
            </Link>
          </div>
        )}
      </div>

      {tab === 'head' && (
        <div className="note">
          ⚠ 头部账号的赞粉比通常更低：他们的互动靠粉丝基数堆出来，不靠结构。看他们只能学
          <b>选题方向</b>，学不到<b>方法</b>。
        </div>
      )}
      {tab === 'self' && (
        <div className="note">
          ✦ 这是你自己库里的作品。你的赞粉比 {myRatio.toFixed(1)}×，同级中位{' '}
          {(median?.ratio ?? 0).toFixed(1)}×。
        </div>
      )}

      <div className="sec-head">
        <h2>我 vs 同级爆款</h2>
        <span className="hint">
          {myBest ? `《${myBest.title.slice(0, 18)}》` : '我的作品'} 对比 {median?.count ?? 0} 条同级爆款中位
        </span>
      </div>
      {myFans < 100 && (
        <div className="note" style={{ marginTop: 0, marginBottom: 0, borderColor: 'var(--amber)' }}>
          ⚠ 你目前只有 <b>{myFans}</b> 个粉丝。赞粉比的分母太小，任何一条的点赞都会被放大成倍数，
          这个数字现在只能看趋势，不能当结论。粉丝过百再回来对比更有意义。
        </div>
      )}
      <div className="card">
        <div className="cmp-row cmp-head">
          <div>维度</div>
          <div>我的作品</div>
          <div>同级爆款中位</div>
          <div>判定</div>
        </div>
        {gaps.map((g) => (
          <div className="cmp-row" key={g.d}>
            <div className="cmp-dim">{g.d}</div>
            <div className="cmp-v" style={{ color: g.pending ? 'var(--text3)' : undefined }}>
              {g.mine}
            </div>
            <div className="cmp-v" style={{ color: 'var(--text2)' }}>
              {g.bench}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span className={`verdict ${g.pending ? '' : g.bad ? 'v-bad' : 'v-ok'}`}>{g.v}</span>
              {!g.pending && (
                <div className={`cmp-bar${g.bad ? '' : ' ok'}`}>
                  <i style={{ width: `${g.w}%` }} />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="sec-head">
        <h2>差距 → 动作</h2>
        <span className="hint">只取能改的维度</span>
      </div>
      <div className="card">
        <div className="dir-item">
          <div className="dir-k">01 互动</div>
          <div className="dir-v">
            <b>
              你的赞粉比 {myRatio.toFixed(1)}×，同级中位 {(median?.ratio ?? 0).toFixed(1)}×。
            </b>
            这个比值衡量「同样粉丝量能撬动多少点赞」，小号做爆款看的就是它。差距主要来自内容本身让人想
            「收藏 / 转发」，而不是看完就走。
          </div>
        </div>
        <div className="dir-item">
          <div className="dir-k">02 时长</div>
          <div className="dir-v">
            <b>
              同级爆款时长中位{' '}
              {median?.durationSec ? `${Math.round(median.durationSec)} 秒` : '—'}，你的最好一条是{' '}
              {myBest?.durationSec ?? '—'} 秒。
            </b>
            时长不是越短越好，但超过中位 2 倍时，完播率会被数学规律压死。
          </div>
        </div>
        <div className="dir-item">
          <div className="dir-k">03 结构</div>
          <div className="dir-v">
            <b>前 3 秒、标题结构、结尾引导还没法自动判断。</b>
            公开页拿不到这些，要接创作者后台的 2 秒留存才有依据——现在不编。
          </div>
        </div>
      </div>

      <div className="note">
        ✦ 结构可以学，文案不能抄。给动作时只给结构（时长、钩子类型、节奏），不给原句。
        抖音公开页隐藏了播放量，所以这里的基准是点赞，不是播放。
      </div>
    </>
  );
}
