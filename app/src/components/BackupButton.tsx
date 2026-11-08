'use client';
import { useState } from 'react';
export default function BackupButton() {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function backup() {
    setBusy(true); setMessage('正在创建备份…');
    try {
      const res = await fetch('/api/backup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '备份失败');
      setMessage(`已保存到：${data.path}`);
    } catch (e) { setMessage(e instanceof Error ? e.message : '备份失败'); }
    finally { setBusy(false); }
  }
  return <section className="card" style={{ padding: 20, marginBottom: 18 }}>
    <h2 style={{fontSize: 16, marginBottom: 8}}>数据备份</h2>
    <p style={{fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 12}}>保存数据库的一致性快照，包含作品、指标和收件箱记录；不包含浏览器登录态和 API Key。备份保存在本机数据目录，不会自动上传。</p>
    <button className="btn ghost" disabled={busy} onClick={backup}>{busy ? '正在备份…' : '创建本地备份'}</button>
    <p aria-live="polite" style={{fontSize: 12, color: 'var(--text2)', overflowWrap: 'anywhere', marginTop: 8}}>{message}</p>
    <p style={{fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginTop: 8}}>恢复前请先停止网页和监控，并保留当前数据库副本；本版本暂不提供自动恢复。</p>
  </section>;
}
