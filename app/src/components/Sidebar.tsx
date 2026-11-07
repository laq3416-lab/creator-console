'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: '总览', icon: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z' },
  {
    href: '/monitor',
    label: '监控',
    icon: 'M3 12h4l3 8 4-16 3 8h4',
  },
  { href: '/accounts', label: '账号矩阵', icon: 'M4 20v-6M12 20V4M20 20v-9', num: 'accounts' },
  { href: '/contents', label: '作品库', icon: 'M4 5h16M4 12h16M4 19h10', num: 'contents' },
  {
    href: '/bench',
    label: '爆款雷达',
    icon: 'M12 12l7-7M12 3a9 9 0 1 0 9 9M12 9a3 3 0 1 1 0 6',
    num: 'bench',
  },
  {
    href: '/products',
    label: '商品分析',
    icon: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  },
  {
    href: '/topics',
    label: '选题库',
    icon: 'M4 4h16v4H4zM4 12h10v8H4zM17 12h3v8h-3z',
    num: 'topics',
  },
  { href: '/inbox', label: '收件箱', icon: 'M3 6h18v12H3zM3 6l9 7 9-7', num: 'inbox' },
  {
    href: '/advisor',
    label: '智能建议',
    icon:
      'M12 3v3M12 18v3M3 12h3M18 12h3M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2',
    num: 'advisor',
  },
];

export type NavCounts = {
  topicCount: number;
  accountCount: number;
  contentCount: number;
  benchCount: number;
  unread: number;
  newSugg: number;
};

export default function Sidebar({ counts, syncLabel }: { counts: NavCounts; syncLabel: string }) {
  const pathname = usePathname();
  const valueOf = (k?: string) => {
    if (!k) return null;
    const map: Record<string, number> = {
      accounts: counts.accountCount,
      contents: counts.contentCount,
      bench: counts.benchCount,
      inbox: counts.unread,
      advisor: counts.newSugg,
      topics: counts.topicCount,
    };
    const v = map[k];
    return v ? String(v) : null;
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">◈</div>
        <div>
          <div className="brand-name">中控台</div>
          <div className="brand-sub">Creator OS</div>
        </div>
      </div>

      <nav className="nav">
        {NAV.map((n) => {
          const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
          const num = valueOf(n.num);
          return (
            <Link key={n.href} href={n.href} className={`nav-item${active ? ' active' : ''}`}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d={n.icon} />
              </svg>
              <span>{n.label}</span>
              {num && <span className="nav-num">{num}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="side-foot">
        <Link href="/setup" className={`nav-item${pathname.startsWith('/setup') ? ' active' : ''}`} style={{ marginBottom: 8 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
          <span>设置</span>
        </Link>
        <div className="sync">
          <span className="dot pulse" />
          {syncLabel}
        </div>
        <div className="sync">
          <span className="dot warn" />
          {counts.accountCount === 0 ? '空库 · 等待接入' : '数据来自本地库'}
        </div>
      </div>
    </aside>
  );
}
