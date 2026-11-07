import Link from 'next/link';
import { getConversations, getMessages, getLastRunByTask } from '@/db/queries';
import { PLATFORMS, relTime, chatTime, type Platform } from '@/lib/format';
import EmptyState from '@/components/EmptyState';

export const dynamic = 'force-dynamic';

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'douyin', label: '抖音' },
  { key: 'xhs', label: '小红书' },
  { key: 'xianyu', label: '闲鱼' },
];

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string; c?: string }>;
}) {
  const sp = await searchParams;
  const p = sp.p && sp.p !== 'all' ? (sp.p as Platform) : undefined;
  const lastInbox = getLastRunByTask()['inbox'];
  const all = getConversations();
  const list = p ? all.filter((c) => c.platform === p) : all;
  const current = list.find((c) => c.id === sp.c) ?? list[0];
  const messages = current ? getMessages(current.id) : [];
  const active = p ?? 'all';

  if (all.length === 0) {
    return (
      <>
        <EmptyState
          icon="✉"
          title="收件箱还是空的"
          desc="私信和评论需要登录态才能读，所以要在本机跑采集服务。接通之后，三个平台的会话会汇总到这里，按未读和紧急程度排序。"
          steps={['启动采集服务并登录三个平台', '按 15 分钟一次低频拉取会话', '命中关键词或超时未回，立刻出提醒']}
          cta="启动采集（M3 接入）"
        />
        <div className="note">✦ 发送功能默认关闭。开通后也必须「点击确认」才发出，并记台账。</div>
      </>
    );
  }

  const totalUnread = all.reduce((a, b) => a + b.unreadCount, 0);
  const perPlatform = (k: Platform) => all.filter((c) => c.platform === k).reduce((a, b) => a + b.unreadCount, 0);

  const href = (filter: string, convId?: string) => {
    const q = new URLSearchParams();
    if (filter !== 'all') q.set('p', filter);
    if (convId) q.set('c', convId);
    const s = q.toString();
    return s ? `/inbox?${s}` : '/inbox';
  };

  return (
    <>
      <div className="card statusbar" style={{ marginBottom: 12 }}>
        <span className="dot pulse" />
        <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>
          已接入：<b>闲鱼</b> {all.filter((c) => c.platform === 'xianyu').length} 个
          <span>　·　</span>
          <b>小红书</b> {all.filter((c) => c.platform === 'xhs').length} 个
          <span>　·　</span>
          <b>抖音</b> {all.filter((c) => c.platform === 'douyin').length} 个
        </div>
        <div style={{ flex: 1 }} />
        <span className="pill" style={{ fontSize: 11 }}>
          {lastInbox?.finishedAt ? `上次同步 ${relTime(lastInbox.finishedAt)}` : '尚未同步'} · 小红书 5 分钟 / 闲鱼·抖音 20 分钟
        </span>
      </div>

      <div className="card inbox">
        <div className="conv-list">
          <div className="conv-filter">
            {FILTERS.map((f) => {
              const n =
                f.key === 'all' ? totalUnread : perPlatform(f.key as Platform);
              return (
                <Link key={f.key} href={href(f.key)} className={`chip${active === f.key ? ' on' : ''}`}>
                  {f.label}
                  {n ? ` ${n}` : ''}
                </Link>
              );
            })}
          </div>
          <div className="convs">
            {list.map((c) => (
              <Link
                key={c.id}
                href={href(active, c.id)}
                className={`conv${current?.id === c.id ? ' on' : ''}`}
              >
                <div className="conv-av" style={{ color: `var(${PLATFORMS[c.platform].cssVar})` }}>
                  {c.peerAvatar}
                </div>
                <div className="conv-main">
                  <div className="conv-row">
                    <span className="conv-name">{c.peerName}</span>
                    <span className="pill" style={{ fontSize: 10, padding: '0 6px' }}>
                      {PLATFORMS[c.platform].name}
                    </span>
                    <span className="conv-time">{relTime(c.lastMessageAt)}</span>
                  </div>
                  <div className="conv-row">
                    <span className="conv-msg" style={{ flex: 1 }}>
                      {c.lastText}
                    </span>
                    {c.unreadCount > 0 && <span className="badge">{c.unreadCount}</span>}
                  </div>
                </div>
              </Link>
            ))}
            {list.length === 0 && (
              <div style={{ padding: 24, color: 'var(--text3)', fontSize: 12.5 }}>该平台暂无会话</div>
            )}
          </div>
        </div>

        <div className="thread">
          {current ? (
            <>
              <div className="thread-head">
                <div className="conv-av" style={{ color: `var(${PLATFORMS[current.platform].cssVar})` }}>
                  {current.peerAvatar}
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{current.peerName}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {PLATFORMS[current.platform].name} · 标签：{current.tag ?? '—'} · 状态：
                    {current.status === 'open' ? '待处理' : current.status === 'pending' ? '跟进中' : '已处理'}
                  </div>
                </div>
                <div style={{ flex: 1 }} />
                <a
                  className="btn"
                  style={{ padding: '6px 11px', fontSize: 11.5 }}
                  href={
                    current.platform === 'xianyu'
                      ? `https://www.goofish.com/im?sessionId=${current.id.replace(/^xy_/, '')}`
                      : current.platform === 'xhs'
                        ? 'https://www.xiaohongshu.com/messages'
                        : 'https://www.douyin.com/'
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  去平台回复 ↗
                </a>
                <button className="btn ghost" style={{ padding: '6px 11px', fontSize: 11.5 }} disabled>
                  标记已处理
                </button>
              </div>

              <div className="thread-body">
                {messages.length <= 1 && (
                  <div style={{ fontSize: 11.5, color: 'var(--text3)', textAlign: 'center', padding: '6px 0' }}>
                    下面只是平台返回的最后一条消息，完整往返对话要点进平台看
                  </div>
                )}
                {messages.map((m) => (
                  <div key={m.id} className={`msg ${m.direction === 'in' ? 'in' : 'out'}`}>
                    {m.text}
                    <div className="msg-t">
                      {chatTime(m.createdAt)}
                      {m.direction === 'out' ? ' · 已送达' : ''}
                    </div>
                  </div>
                ))}
              </div>

              <div className="composer">
                <input placeholder="站内发送还没接，点右上角「去平台回复」跳转" disabled />
                <button className="btn" disabled>
                  发送
                </button>
              </div>
            </>
          ) : (
            <div style={{ padding: 40, color: 'var(--text3)' }}>没有会话</div>
          )}
        </div>
      </div>

      <div className="note">
        ✦ 发送功能默认关闭。开通后也必须「点击确认」才发出，并记台账——这是这类工具的行业共识，避免误回造成投诉。
      </div>
    </>
  );
}
