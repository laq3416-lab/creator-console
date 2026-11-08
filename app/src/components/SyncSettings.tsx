'use client';
import { useEffect, useState } from 'react';

type Platform = 'douyin' | 'xhs' | 'xianyu';
const platforms: { key: Platform; label: string; note: string }[] = [
  { key: 'douyin', label: '抖音', note: '采集可能短暂打开浏览器窗口' },
  { key: 'xhs', label: '小红书', note: '主要采集任务使用后台浏览器' },
  { key: 'xianyu', label: '闲鱼', note: '采集可能短暂打开浏览器窗口' },
];
export default function SyncSettings() {
  const [settings, setSettings] = useState<Record<string, number> | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  async function load() {
    const res = await fetch('/api/sync', { cache: 'no-store' });
    if (!res.ok) throw new Error('读取失败');
    const data = await res.json(); setSettings(data.settings); setPending(data.pending.map((p: {task: string}) => p.task));
  }
  useEffect(() => { load().catch(() => setNotice('读取设置失败，请刷新页面重试')); const id = setInterval(() => load().catch(() => {}), 10000); return () => clearInterval(id); }, []);
  async function send(platform: Platform, body: object) {
    setBusy(platform); setNotice('');
    try {
      const res = await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ platform, ...body }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');
      await load();
      setNotice('kind' in body ? '已加入队列，监控会依次处理。请在下方运行记录查看结果。' : '设置已保存，调度器会自动读取。');
    } catch (e) { setNotice(e instanceof Error ? e.message : '操作失败'); }
    finally { setBusy(''); }
  }
  return <section className="card" style={{ padding: 20, marginBottom: 18 }} aria-labelledby="sync-settings-title">
    <h2 id="sync-settings-title" style={{ fontSize: 16, marginBottom: 6 }}>同步与打扰设置</h2>
    <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>每个平台可独立设置。手动模式不会自动打开采集窗口；点击同步后可能短暂出现窗口。频率同时适用于该平台的作品、私信及对标任务。</p>
    {platforms.map(({ key, label, note }) => {
      const collect = key === 'douyin' ? 'collect' : `collect:${key}`;
      return <div key={key} className="sync-row">
        <div><strong>{label}</strong><div className="sync-note">{note}</div></div>
        <label>自动同步频率 <select value={settings?.[key] ?? 0} disabled={!settings || Boolean(busy)} onChange={e => send(key, { action: 'settings', minutes: Number(e.target.value) })}>
          <option value={0}>仅手动</option><option value={60}>每小时</option><option value={360}>每 6 小时</option><option value={1440}>每天</option>
        </select></label>
        <div className="sync-actions"><button disabled={Boolean(busy) || pending.includes(collect)} onClick={() => send(key, { action: 'sync', kind: 'content' })}>{pending.includes(collect) ? '作品排队中' : '同步作品'}</button><button disabled={Boolean(busy) || pending.includes(`inbox:${key}`)} onClick={() => send(key, { action: 'sync', kind: 'inbox' })}>{pending.includes(`inbox:${key}`) ? '私信排队中' : '同步私信'}</button></div>
      </div>;
    })}
    <p aria-live="polite" style={{ color: 'var(--text2)', fontSize: 12, minHeight: 18, marginTop: 10 }}>{notice}</p>
  </section>;
}
