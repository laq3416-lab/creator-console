import fs from 'node:fs';
import path from 'node:path';
import Link from 'next/link';
import { getJobRuns, getLastRunByTask, getNewViralSuggestions, getRadarSuggestionTarget } from '@/db/queries';
import { relTime } from '@/lib/format';
import { WATCHER_FILE } from '@/lib/paths';
import SyncSettings from '@/components/SyncSettings';
import BackupButton from '@/components/BackupButton';

export const dynamic = 'force-dynamic';

const TASK_META: Record<string, { label: string; every: string; everyMs: number }> = {
  rules: { label: '跑规则', every: '30 分钟', everyMs: 30 * 60_000 },
  collect: { label: '抖音作品', every: '由用户设置', everyMs: 86400000 },
  'collect:xhs': { label: '小红书作品', every: '由用户设置', everyMs: 86400000 },
  'collect:xianyu': { label: '闲鱼商品', every: '由用户设置', everyMs: 86400000 },
  'inbox:xhs': { label: '小红书私信', every: '由用户设置', everyMs: 86400000 },
  'inbox:xianyu': { label: '闲鱼私信', every: '由用户设置', everyMs: 86400000 },
  'inbox:douyin': { label: '抖音私信', every: '由用户设置', everyMs: 86400000 },
  radar: { label: '爆款雷达', every: '由用户设置', everyMs: 86400000 },
  analyze: { label: '模型复盘', every: '24 小时', everyMs: 24 * 3_600_000 },
};

function readBeat() {
  try {
    const f = WATCHER_FILE;
    if (!fs.existsSync(f)) return null;
    const b = JSON.parse(fs.readFileSync(f, 'utf8'));
    return { ...b, ageSec: Math.round((Date.now() - b.lastBeat) / 1000) };
  } catch {
    return null;
  }
}

export default function MonitorPage() {
  const beat = readBeat();
  const alive = Boolean(beat && beat.ageSec < 180);
  const lastByTask = getLastRunByTask();
  const runs = getJobRuns(24);
  const virals = getNewViralSuggestions(5);

  return (
    <>
      <div className={`card statusbar`} style={{ marginBottom: 14 }}>
        <span className={`dot ${alive ? 'pulse' : 'warn'}`} />
        <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>
          {alive ? (
            <>
              监控运行中 · 心跳 {beat!.ageSec} 秒前
              {beat!.state?.startsWith('running:') && (
                <span style={{ marginLeft: 8, color: 'var(--accent)' }}>
                  正在 {TASK_META[beat!.state.slice('running:'.length)]?.label ?? beat!.state}
                </span>
              )}
            </>
          ) : (
            <>监控未运行。手动同步会尝试启动；若仍无响应，请检查账号登录状态或重启网页服务。</>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <span className="pill">每 60 秒检查一次</span>
      </div>

      <SyncSettings />
      <BackupButton />

      <div className="grid g4">
        {Object.entries(TASK_META).filter(([key]) => key === 'rules' || key === 'analyze').map(([key, meta]) => {
          const last = lastByTask[key];
          const ok = last?.status === 'ok';
          const overdue = last?.finishedAt
            ? Date.now() - last.finishedAt > meta.everyMs * 1.5
            : true;
          return (
            <div className="card kpi" key={key}>
              <div className="kpi-label">{meta.label}</div>
              <div className="kpi-value" style={{ fontSize: 18, marginTop: 10 }}>
                {last?.finishedAt ? relTime(last.finishedAt) : '从未运行'}
              </div>
              <div className="kpi-meta">
                <span className={`trend ${ok ? 'up' : 'down'}`}>{ok ? '成功' : last ? '失败' : '—'}</span>
                <span>
                  每 {meta.every}
                  {overdue && last ? ' · 已超时' : ''}
                </span>
              </div>
              {last?.detail && (
                <div
                  style={{
                    fontSize: 11,
                    color: 'var(--text3)',
                    marginTop: 8,
                    lineHeight: 1.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}
                >
                  {last.detail}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="sec-head">
        <h2>最近发现的新爆款</h2>
        <span className="hint">赞粉比 ≥ 5 倍，每次扫描自动生成</span>
        <Link href="/bench" className="more">
          去爆款雷达 →
        </Link>
      </div>
      <div className="card">
        {virals.length === 0 ? (
          <div className="empty-sm" style={{ padding: '32px 24px' }}>
            还没有新爆款提醒。下次扫描同赛道时会自动冒出来。
          </div>
        ) : (
          <div className="alert-list">
            {virals.map((v) => {
              const target = getRadarSuggestionTarget(v);
              return <div className="alert a-green" key={v.id}>
                <div className="alert-bar" />
                <div className="alert-body">
                  <div className="alert-title">
                    {target ? <Link href={`/bench/${encodeURIComponent(target)}`}>{v.title} · 查看详情 →</Link> : v.title}
                    <span className="tag">新爆款</span>
                  </div>
                  <div className="alert-text">{v.rationale}</div>
                  <div className="alert-act">{v.action} →</div>
                </div>
                <div className="alert-time">{relTime(v.createdAt)}</div>
              </div>;
            })}
          </div>
        )}
      </div>

      <div className="sec-head">
        <h2>运行记录</h2>
        <span className="hint">可在此查看同步结果；手动请求会按顺序处理</span>
      </div>
      <div className="card tbl-wrap">
        <table>
          <thead>
            <tr>
              <th>任务</th>
              <th>状态</th>
              <th>开始</th>
              <th>耗时</th>
              <th>输出末行</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{TASK_META[r.task]?.label ?? r.task}</td>
                <td>
                  <span
                    className="pill"
                    style={
                      r.status === 'ok'
                        ? { color: 'var(--green)', borderColor: 'var(--green)', background: 'var(--green-bg)' }
                        : r.status === 'failed'
                          ? { color: 'var(--red)', borderColor: 'var(--red)', background: 'var(--red-bg)' }
                          : {}
                    }
                  >
                    {r.status === 'ok' ? '成功' : r.status === 'failed' ? '失败' : (!alive || beat?.state !== `running:${r.task}`) ? '已中断或状态未知' : '运行中'}
                  </span>
                </td>
                <td className="num" style={{ color: 'var(--text3)' }}>
                  {new Date(r.startedAt).toLocaleString('zh-CN', { hour12: false })}
                </td>
                <td className="num">
                  {r.finishedAt ? `${Math.round((r.finishedAt - r.startedAt) / 1000)}s` : '—'}
                </td>
                <td
                  style={{
                    fontSize: 11.5,
                    color: 'var(--text3)',
                    maxWidth: 420,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {r.detail ?? ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="note">
        ✦ 手动同步会排队，监控每分钟检查一次；正在运行的任务结束后才会处理下一个。
      </div>
    </>
  );
}
