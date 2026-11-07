'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import type { NavCounts } from './Sidebar';

const THEMES: { key: string; label: string }[] = [
  { key: 'dark', label: '深色' },
  { key: 'light', label: '浅色' },
  { key: 'dense', label: '高密度' },
];

export default function Topbar({
  counts,
  lastSynced,
  benchAccountCount,
  avatarUrl,
  nickname,
}: {
  counts: NavCounts;
  lastSynced: number | null;
  benchAccountCount: number;
  avatarUrl?: string | null;
  nickname?: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState('dark');
  const [busy, setBusy] = useState(false);
  const [tip, setTip] = useState('刷新数据');

  async function refresh() {
    if (busy) return;
    setBusy(true);
    setTip('采集中…');
    try {
      const r = await fetch('/api/refresh', { method: 'POST' });
      const d = await r.json();
      if (!d.started) {
        setTip(d.reason ?? '未启动');
        setBusy(false);
        return;
      }
      // 采集约 30 秒，轮询到结束
      for (let i = 0; i < 40; i++) {
        await new Promise((res) => setTimeout(res, 2000));
        const st = await fetch('/api/refresh').then((x) => x.json());
        if (!st.refreshing) break;
      }
      setTip('已更新');
      router.refresh();
    } catch {
      setTip('失败，看终端');
    } finally {
      setBusy(false);
      setTimeout(() => setTip('刷新数据'), 2500);
    }
  }

  useEffect(() => {
    const saved = localStorage.getItem('theme');
    if (saved) {
      setTheme(saved);
      document.documentElement.dataset.theme = saved;
    }
  }, []);

  function pick(t: string) {
    setTheme(t);
    document.documentElement.dataset.theme = t;
    localStorage.setItem('theme', t);
  }

  const clock = lastSynced
    ? new Date(lastSynced).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : '—';

  const meta = (() => {
    if (pathname.startsWith('/setup')) return '接入自己的账号与 API Key';
    if (pathname.startsWith('/monitor')) return '常驻任务 · 采集 / 规则 / 对标 / 复盘';
    if (pathname.startsWith('/accounts')) return `${counts.accountCount} 个账号 · 单账号趋势与绑定`;
    if (pathname.startsWith('/contents')) return `${counts.contentCount} 条作品 · 支持按平台筛选`;
    if (pathname.startsWith('/bench'))
      return `追踪 ${benchAccountCount} 个对标账号 · ${counts.benchCount} 条爆款`;
    if (pathname.startsWith('/products')) return '闲鱼商品：曝光 / 浏览 / 想要 / 成交，与同类对标';
    if (pathname.startsWith('/topics')) return `${counts.topicCount} 条在流程中 · 从选题到发布`;
    if (pathname.startsWith('/inbox')) return `${counts.unread} 条未读 · 三平台统一收件箱`;
    if (pathname.startsWith('/advisor')) return `${counts.newSugg} 条待处理 · 规则预警 + 模型复盘`;
    if (counts.accountCount === 0) return '尚未接入任何账号';
    return `${counts.accountCount} 个账号 · 数据截至 ${clock}`;
  })();

  const title = (() => {
    if (pathname.startsWith('/setup')) return '设置';
    if (pathname.startsWith('/monitor')) return '监控';
    if (pathname.startsWith('/accounts')) return '账号矩阵';
    if (pathname.startsWith('/contents')) return '作品库';
    if (pathname.startsWith('/bench')) return '爆款雷达';
    if (pathname.startsWith('/products')) return '商品分析';
    if (pathname.startsWith('/topics')) return '选题库';
    if (pathname.startsWith('/inbox')) return '收件箱';
    if (pathname.startsWith('/advisor')) return '智能建议';
    return '总览';
  })();

  return (
    <header className="topbar">
      <div>
        <div className="page-title">{title}</div>
        <div className="page-sub">{meta}</div>
      </div>
      <div style={{ flex: 1 }} />
      <div className="themes">
        {THEMES.map((t) => (
          <button key={t.key} className={theme === t.key ? 'on' : ''} onClick={() => pick(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <button className="icon-btn" title={tip} onClick={refresh} disabled={busy}
        style={{ opacity: busy ? 0.6 : 1, cursor: busy ? 'wait' : 'pointer' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round"
          style={busy ? { animation: 'spin 1s linear infinite' } : undefined}>
          <path d="M21 12a9 9 0 1 1-3-6.7" />
          <path d="M21 3v6h-6" />
        </svg>
      </button>
      {avatarUrl ? (
        // 用账号真实头像；加载失败时退回昵称首字
        <img
          className="avatar"
          src={`/api/avatar?u=${encodeURIComponent(avatarUrl)}`}
          alt={nickname ?? '我'}
          referrerPolicy="no-referrer"
          style={{ objectFit: 'cover' }}
          onError={(e) => {
            const el = e.currentTarget;
            el.style.display = 'none';
            el.insertAdjacentHTML(
              'afterend',
              `<div class="avatar">${(nickname ?? '我').slice(0, 1)}</div>`,
            );
          }}
        />
      ) : (
        <div className="avatar">{(nickname ?? '泽').slice(0, 1)}</div>
      )}
    </header>
  );
}
