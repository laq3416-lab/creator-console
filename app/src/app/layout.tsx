import type { Metadata } from 'next';
import './globals.css';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import { getNavCounts, getLastSyncedAt } from '@/db/queries';
import { relTime } from '@/lib/format';
import { db } from '@/db';
import { benchmarkAccount, topic, account } from '@/db/schema';
import { sql } from 'drizzle-orm';

export const metadata: Metadata = {
  title: '中控台 · Creator OS',
  description: '多平台自媒体数据中控台：账号数据、作品表现、评论私信、爆款对标',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const counts = getNavCounts();
  const lastSynced = getLastSyncedAt();
  const benchAccountCount =
    db.select({ n: sql<number>`count(*)` }).from(benchmarkAccount).get()?.n ?? 0;

  const syncLabel = lastSynced ? `上次采集 ${relTime(lastSynced)}` : '尚未采集';

  // 顶栏头像用主账号的
  const primary = db
    .select({ nickname: account.nickname, avatarUrl: account.avatarUrl })
    .from(account)
    .where(sql`avatar_url IS NOT NULL`)
    .limit(1)
    .get();

  const topicCount =
    db
      .select({ n: sql<number>`count(*)` })
      .from(topic)
      .where(sql`status NOT IN ('published','dropped')`)
      .get()?.n ?? 0;

  const navCounts = {
    topicCount,
    accountCount: counts.accountCount,
    contentCount: counts.contentCount,
    benchCount: counts.benchCount,
    unread: counts.unread,
    newSugg: counts.newSugg,
  };

  return (
    <html lang="zh-CN" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* 在首帧前应用主题，避免闪白 */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t;}catch(e){}`,
          }}
        />
      </head>
      <body>
        <div className="shell">
          <Sidebar counts={navCounts} syncLabel={syncLabel} />
          <main className="main">
            <Topbar
              counts={navCounts}
              lastSynced={lastSynced}
              benchAccountCount={benchAccountCount}
              avatarUrl={primary?.avatarUrl ?? null}
              nickname={primary?.nickname ?? null}
            />
            <div className="content">{children}</div>
          </main>
        </div>
      </body>
    </html>
  );
}
