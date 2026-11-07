import { getAccountsWithSeries, getContents } from '@/db/queries';
import { fmt, relTime, PLATFORMS, type Platform } from '@/lib/format';
import { AreaChart, PlatBadge } from '@/lib/charts';
import EmptyState from '@/components/EmptyState';

export const dynamic = 'force-dynamic';

export default function AccountsPage() {
  const accounts = getAccountsWithSeries();
  const contents = getContents();

  if (accounts.length === 0) {
    return (
      <EmptyState
        icon="◈"
        title="还没有绑定账号"
        desc="绑定用的是本机采集服务：你在自己的浏览器里登录一次，登录态只留在本机，系统不会碰你的密码。"
        steps={[
          '启动采集服务（本机 127.0.0.1，不对外暴露）',
          '在弹出的浏览器窗口扫码登录抖音创作者后台',
          '系统自动识别账号并开始按计划采集',
        ]}
        cta="启动采集（M2 接入）"
      />
    );
  }

  return (
    <>
      <div className="grid g3" style={{ marginBottom: 6 }}>
        {accounts.map((a) => {
          const p = PLATFORMS[a.platform as Platform];
          const mine = contents.filter((c) => c.accountId === a.id);
          return (
            <div className="card" key={a.id} style={{ padding: 'var(--pad)', display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="acc-top">
                <PlatBadge platform={a.platform as Platform} size={34} />
                <div>
                  <div className="acc-name">{a.handle}</div>
                  <div className="acc-handle">{p.name}</div>
                </div>
                <span className="dot" style={{ marginLeft: 'auto' }} />
              </div>

              <div>
                <AreaChart
                  data={a.gainSeries}
                  labels={['D-6', 'D-5', 'D-4', 'D-3', 'D-2', 'D-1', '今天']}
                  color={`var(${p.cssVar})`}
                  w={300}
                  h={96}
                />
              </div>

              <div className="acc-nums" style={{ justifyContent: 'space-between' }}>
                <div className="acc-num">
                  <b>{a.followerCount ? fmt(a.followerCount) : '—'}</b>
                  <span>粉丝</span>
                </div>
                <div className="acc-num">
                  <b>{a.workCount}</b>
                  <span>作品</span>
                </div>
                <div className="acc-num">
                  <b>{mine.length}</b>
                  <span>已入库</span>
                </div>
              </div>

              <div className="acc-foot">
                <span>上次同步 {a.lastSyncedAt ? relTime(a.lastSyncedAt) : '—'}</span>
                <span className="pill">种子数据</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sec-head">
        <h2>绑定新账号</h2>
        <span className="hint">抖音 / 小红书 / 闲鱼</span>
      </div>
      <div className="card" style={{ padding: 22, display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 5 }}>
            用本机采集服务绑定，不碰你的密码
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
            在本机浏览器里登录一次创作者后台，之后按计划自动采集。
            <br />
            登录态只存在你本机，绝不上传服务器。
          </div>
        </div>
        <button className="btn" disabled>
          启动采集（M2 接入）
        </button>
        <button className="btn ghost" disabled>
          查看教程
        </button>
      </div>

      <div className="note">
        M1 阶段只做了数据结构与界面，采集服务还没接。M2 会先接抖音创作者后台，拿到完播率、涨粉这类公开页看不到的指标。
      </div>
    </>
  );
}
