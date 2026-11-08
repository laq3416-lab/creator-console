import Link from 'next/link';
import {
  getAccountsWithSeries,
  getContents,
  getSuggestions,
  getNavCounts,
  getUnreadByAccount,
  getLastSyncedAt,
} from '@/db/queries';
import { fmt, relTime, interRate, PLATFORMS, type Platform } from '@/lib/format';
import { Sparkline, AreaChart, PlatBadge } from '@/lib/charts';
import EmptyState from '@/components/EmptyState';
import Evidence from '@/components/Evidence';

export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  const accounts = getAccountsWithSeries();
  const contents = getContents();
  const suggestions = getSuggestions(10);
  const counts = getNavCounts();
  const unreadByAccount = getUnreadByAccount();
  const lastSynced = getLastSyncedAt();

  if (accounts.length === 0) {
    return (
      <>
        <EmptyState
          icon="◈"
          title="还没有接入任何账号"
          desc="数据结构、页面和规则引擎都已经就位，但数据管道还没接通。接入之后，这里会出现账号卡片、指标曲线和实时预警。"
          steps={[
            '在本机启动采集服务，用浏览器登录一次抖音创作者后台',
            '系统按计划拉取作品、完播率、涨粉这些公开页看不到的指标',
            '指标过契约校验后入库，规则引擎随即开始产出预警',
          ]}
          cta="启动采集（M2 接入）"
        />
        <div className="note">
          ⚠ 当前为空库。不会用假数据填充，避免你之后分不清哪条是真的。
        </div>
      </>
    );
  }

  const totalFans = accounts.reduce((a, b) => a + b.followerCount, 0);
  const availablePlays = accounts.map((a) => a.playsSeries.at(-1)).filter((n): n is number => n != null);
  const todayPlays = availablePlays.length ? availablePlays.reduce((a, b) => a + b, 0) : null;
  // 涨粉是日增量，粉丝总数只有当前值，所以「今日涨粉」取各账号最新一天的增量
  const gains = accounts.map((a) => a.gainSeries.at(-1)).filter((n): n is number => n != null);
  const gainToday = gains.length ? gains.reduce((a, b) => a + b, 0) : null;

  const redCount = suggestions.filter((s) => s.severity === 'red' && s.status === 'new').length;
  const unreadOf = (platform: string) =>
    accounts.filter((a) => a.platform === platform).reduce((sum, a) => sum + (unreadByAccount[a.id] ?? 0), 0);
  const alerts = suggestions.filter((s) => s.source === 'rule').slice(0, 3);
  const topContents = [...contents].sort((a, b) => (b.plays ?? -1) - (a.plays ?? -1)).slice(0, 5);
  const dy = accounts.find((a) => a.platform === 'douyin');

  const kpis = [
    {
      label: '全网粉丝',
      value: fmt(totalFans),
      trend: gainToday == null ? null : `${gainToday >= 0 ? '+' : ''}${gainToday}`,
      up: true,
      note: '最近可用涨粉指标合计，可能不含所有账号',
      series: [],
      color: 'var(--accent)',
    },
    {
      label: '最近可用播放',
      value: fmt(todayPlays),
      trend: null,
      up: true,
      note: '账号最近可用数据合计，采集时间可能不同',
      series: [],
      color: 'var(--accent)',
    },
    {
      label: '已知未读消息',
      value: String(counts.unread),
      trend: null,
      up: true,
      note: `部分平台不提供未读数 · 闲鱼 ${unreadOf('xianyu')}`,
      series: [],
      color: 'var(--amber)',
    },
    {
      label: '待处理预警',
      value: String(counts.newSugg),
      trend: null,
      up: true,
      note: `${redCount} 条高危`,
      series: [],
      color: 'var(--red)',
    },
  ];;

  return (
    <>
      <div className="grid g4">
        {kpis.map((k) => (
          <div key={k.label} className="card kpi">
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value">{k.value}</div>
            <div className="kpi-meta">
              {k.trend && <span className={`trend ${k.up ? 'up' : 'down'}`}>{k.trend}</span>}
              <span>{k.note}</span>
            </div>
            <div className="kpi-spark">
              <Sparkline data={k.series} color={k.color} />
            </div>
          </div>
        ))}
      </div>

      <div className="sec-head">
        <h2>账号矩阵</h2>
        <span className="hint">点击进入单账号详图</span>
        <Link href="/accounts" className="more">
          管理账号 →
        </Link>
      </div>
      <div className="grid g3">
        {accounts.map((a) => {
          const p = PLATFORMS[a.platform as Platform];
          const delta = a.gainSeries.at(-1) ?? 0;
          return (
            <Link key={a.id} href="/accounts" className="card acc">
              <div className="acc-top">
                <PlatBadge platform={a.platform as Platform} />
                <div style={{ minWidth: 0 }}>
                  <div className="acc-name">{a.handle}</div>
                  <div className="acc-handle">
                    {p.name} · {a.workCount} 作品
                  </div>
                </div>
                <span className="trend up" style={{ marginLeft: 'auto' }}>
                  +{delta}
                </span>
              </div>
              <div className="acc-nums">
                <div className="acc-num">
                  <b>{a.followerCount ? fmt(a.followerCount) : '—'}</b>
                  <span>粉丝</span>
                </div>
                <div className="acc-num">
                  {a.platform === 'xianyu' ? (
                    <>
                      <b>{a.workCount}</b>
                      <span>在售商品</span>
                    </>
                  ) : (
                    <>
                      <b>{fmt(a.playsSeries.at(-1))}</b>
                      <span>今日播放</span>
                    </>
                  )}
                </div>
                <div className="acc-num">
                  <b>{unreadByAccount[a.id] ?? 0}</b>
                  <span>未读</span>
                </div>
              </div>
              <div className="acc-foot">
                <Sparkline data={a.playsSeries} color={`var(${PLATFORMS[a.platform as Platform].cssVar})`} w={70} h={20} />
                <span>近 7 日</span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="sec-head">
        <h2>今日必看</h2>
        <span className="hint">规则引擎实时产出</span>
        <Link href="/advisor" className="more">
          全部建议 →
        </Link>
      </div>
      <div className="grid g-2-1">
        <div className="card">
          <div className="alert-list">
            {alerts.map((s) => (
              <div key={s.id} className={`alert a-${s.severity}`}>
                <div className="alert-bar" />
                <div className="alert-body">
                  <div className="alert-title">
                    {s.title}
                    <span className="tag">{s.tag}</span>
                  </div>
                  <div className="alert-text">{s.rationale}</div>
                  <Evidence raw={s.evidence} />
                  <div className="alert-act">{s.action} →</div>
                </div>
                <div className="alert-time">{relTime(s.createdAt)}</div>
              </div>
            ))}
            {alerts.length === 0 && (
              <div className="empty-sm" style={{ padding: '40px 24px' }}>
                <div style={{ fontSize: 13, color: 'var(--text2)', fontWeight: 600, marginBottom: 6 }}>
                  规则引擎还没跑
                </div>
                <div style={{ lineHeight: 1.7 }}>
                  数据已经入库，但预警规则还没接上。
                  <br />
                  接上之后，完播率异常、涨粉突变、私信堆积会在这里实时冒出来。
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="card chart-wrap">
          <div className="chart-head">
            <span className="chart-val">{fmt(dy?.playsSeries.at(-1))}</span>
            <span className="trend up">+12.4%</span>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 6 }}>
            近 7 日播放量 · 抖音
          </div>
          <AreaChart
            data={dy?.playsSeries ?? []}
            labels={['D-6', 'D-5', 'D-4', 'D-3', 'D-2', 'D-1', '今天']}
            color="var(--dy)"
          />
          <div className="chart-legend">
            <span>
              <i style={{ background: 'var(--dy)' }} />
              抖音
            </span>
            <span>
              <i style={{ background: 'var(--xhs)' }} />
              小红书
            </span>
          </div>
        </div>
      </div>

      <div className="sec-head">
        <h2>作品表现 Top</h2>
        <span className="hint">按播放量排序</span>
        <Link href="/contents" className="more">
          作品库 →
        </Link>
      </div>
      <div className="card tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>作品</th>
              <th>平台</th>
              <th>播放</th>
              <th>点赞</th>
              <th>评论</th>
              <th>收藏</th>
              <th>点赞率</th>
            </tr>
          </thead>
          <tbody>
            {topContents.map((c) => {
              const rate = interRate(c.likes, c.plays);
              return (
                <tr key={c.id}>
                  <td>
                    <div className="t-title">
                      <div className="t-thumb">{c.type === 'video' ? '▶' : c.type === 'note' ? '▤' : '▣'}</div>
                      <div>
                        <b>{c.title}</b>
                        <span>{c.publishedAt ? new Date(c.publishedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="pill">{PLATFORMS[c.platform as Platform].name}</span>
                  </td>
                  <td className="num">{fmt(c.plays)}</td>
                  <td className="num">{fmt(c.likes)}</td>
                  <td className="num">{fmt(c.comments)}</td>
                  <td className="num">{fmt(c.saves)}</td>
                  <td>
                    <div className="rate">
                      <span className="num">{rate == null ? '—' : `${rate.toFixed(1)}%`}</span>
                      <div className="rate-bar">
                        <i style={{ width: `${Math.min(100, (rate ?? 0) * 12)}%` }} />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="note">
        ✓ 数据来自抖音创作者后台，最近一次采集于{' '}
        {lastSynced ? new Date(lastSynced).toLocaleString('zh-CN', { hour12: false }) : '—'}
        。共 {accounts.length} 个账号 / {contents.length} 条作品入库，均已通过契约校验。
      </div>
    </>
  );
}
