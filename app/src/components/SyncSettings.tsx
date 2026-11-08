'use client';
import { useEffect, useState } from 'react';

type Platform = 'douyin' | 'xhs' | 'xianyu';
type TaskStatus = { running: boolean; lastSuccessAt: number | null; latest: {status: string; detail: string | null; startedAt: number} | null };
type SyncData = { settings: Record<string, number>; frequencies: Record<string, number>; pending: {task: string}[]; watcherAlive: boolean; status: Record<string, TaskStatus> };
const platforms: { key: Platform; label: string; note: string }[] = [
  { key: 'douyin', label: '抖音', note: '采集可能短暂打开浏览器窗口' },
  { key: 'xhs', label: '小红书', note: '主要采集任务使用后台浏览器' },
  { key: 'xianyu', label: '闲鱼', note: '采集可能短暂打开浏览器窗口' },
];
const time = (v: number | null) => v ? new Date(v).toLocaleString('zh-CN', { hour12: false }) : '尚无成功记录';
export default function SyncSettings() {
  const [data, setData] = useState<SyncData | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  async function load() {
    const res = await fetch('/api/sync', { cache: 'no-store' });
    if (!res.ok) throw new Error('读取失败');
    setData(await res.json());
  }
  useEffect(() => { load().catch(() => setNotice('读取设置失败，请刷新页面重试')); const id = setInterval(() => load().catch(() => {}), 10000); return () => clearInterval(id); }, []);
  async function send(platform: Platform, body: object) {
    setBusy(platform); setNotice('');
    try {
      const res = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform, ...body }) });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || '操作失败');
      await load();
      setNotice('kind' in body ? '已加入队列，请查看下方运行记录。' : '设置已保存。');
    } catch (e) { setNotice(e instanceof Error ? e.message : '操作失败'); }
    finally { setBusy(''); }
  }
  const statusLabel = (task: string) => {
    if (!data) return '读取中';
    const s = data.status[task];
    if (s?.running) return '正在同步';
    if (data.pending.some((p) => p.task === task)) return data.watcherAlive ? '排队中' : '排队中，监控未运行';
    if (s?.latest?.status === 'failed') return `最近失败：${s.latest.detail || '请查看运行记录'}；上次成功：${time(s.lastSuccessAt)}`;
    if (s?.latest?.status === 'interrupted') return '上次任务中断，请重试';
    return s?.lastSuccessAt ? `上次成功：${time(s.lastSuccessAt)}` : '尚无成功记录';
  };
  return <section className="card" style={{ padding: 20, marginBottom: 18 }} aria-labelledby="sync-settings-title">
    <h2 id="sync-settings-title" style={{ fontSize: 16, marginBottom: 6 }}>同步与打扰设置</h2>
    <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>作品、私信和爆款雷达可分别设置频率。手动模式不会自动采集；手动同步时可能短暂出现浏览器窗口。</p>
    {platforms.map(({ key, label, note }) => {
      const collect = key === 'douyin' ? 'collect' : `collect:${key}`;
      const pending = (task: string) => data?.pending.some(p => p.task === task) || data?.status[task]?.running;
      return <div key={key} className="sync-row">
        <div><strong>{label}</strong><div className="sync-note">{note}</div><div className="sync-note">作品：{statusLabel(collect)}</div><div className="sync-note">私信：{statusLabel(`inbox:${key}`)}</div></div>
        <div className="sync-task-controls">
          {[{ task: collect, kind: 'content', name: key === 'xianyu' ? '商品' : '作品' }, { task: `inbox:${key}`, kind: 'inbox', name: '私信' }, ...(key === 'douyin' ? [{ task: 'radar', kind: 'radar', name: '爆款雷达' }] : [])].map(({task, kind, name}) => <div className="sync-task" key={task}>
            <label>{label}{name}频率 <select value={data?.frequencies[task] ?? 0} disabled={!data || Boolean(busy)} onChange={e => send(key, { action: 'settings', kind, minutes: Number(e.target.value) })}>
              <option value={0}>仅手动</option><option value={60}>每小时</option><option value={360}>每 6 小时</option><option value={1440}>每天</option>
            </select></label>
            <button disabled={Boolean(busy) || pending(task)} onClick={() => send(key, { action: 'sync', kind })}>{pending(task) ? '处理中' : kind === 'radar' ? '扫描爆款' : `同步${name}`}</button>
          </div>)}
        </div>
      </div>;
    })}
    <p aria-live="polite" style={{ color: 'var(--text2)', fontSize: 12, minHeight: 18, marginTop: 10 }}>{notice}</p>
  </section>;
}
