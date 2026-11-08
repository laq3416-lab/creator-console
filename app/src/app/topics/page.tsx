import { desc } from 'drizzle-orm';
import Link from 'next/link';
import { db } from '@/db';
import { topic } from '@/db/schema';
import { getContents } from '@/db/queries';
import { addTopic, moveTopic, linkContent, unlinkContent } from './actions';
import { fmt, interRate } from '@/lib/format';
import EmptyState from '@/components/EmptyState';

export const dynamic = 'force-dynamic';

const COLS = [
  { key: 'idea', label: '待拍', next: 'planned', nextLabel: '排期' },
  { key: 'planned', label: '计划中', next: 'shot', nextLabel: '已拍' },
  { key: 'shot', label: '已拍待发', next: 'published', nextLabel: '已发布' },
  { key: 'published', label: '已发布', next: null, nextLabel: '' },
];

const SOURCE_LABEL: Record<string, string> = {
  llm: '模型生成',
  manual: '手动添加',
  radar: '爆款衍生',
};

export default function TopicsPage() {
  const all = db.select().from(topic).orderBy(desc(topic.createdAt)).all();
  const contents = getContents().sort((a, b) => b.publishedAt - a.publishedAt);
  const contentMap = new Map(contents.map((c) => [c.id, c]));
  const active = all.filter((t) => !['published', 'dropped'].includes(t.status));


  return (
    <>
      <form action={addTopic} className="toolbar" style={{ gap: 8 }}>
        <input
          name="title"
          placeholder="手动加一条选题…"
          style={{
            flex: 1,
            minWidth: 240,
            background: 'var(--surface2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 12px',
            color: 'var(--text)',
            fontFamily: 'inherit',
            fontSize: 12.5,
            outline: 'none',
          }}
        />
        <button className="btn" type="submit">
          添加
        </button>
      </form>

      {all.length === 0 && <p className="note" style={{marginBottom: 14}}>先添加一个选题，发布后可关联作品，回看实际数据。</p>}
      <div className="kanban">
        {COLS.map((col) => {
          const items = all.filter((t) => t.status === col.key);
          return (
            <div className="kcol" key={col.key}>
              <div className="kcol-head">
                <span>{col.label}</span>
                <span className="nav-num">{items.length}</span>
              </div>

              {items.length === 0 && <div className="empty-sm">空</div>}

              {items.map((t) => {
                const linked = t.publishedContentId ? contentMap.get(t.publishedContentId) : null;
                return (
                  <div className="kcard" key={t.id}>
                    <div className="kcard-title">{t.title}</div>
                    {t.angle && <div className="kcard-angle">{t.angle}</div>}

                    {t.note && (
                      <div className="kcard-basis">
                        <span>依据</span>
                        {t.note}
                      </div>
                    )}

                    {t.structure && (
                      <details className="kcard-struct">
                        <summary>看结构</summary>
                        <p>{t.structure}</p>
                      </details>
                    )}

                    {col.key === 'published' && (
                      <div className="kcard-linked">
                        {linked ? (
                          <>
                            <Link className="kcard-linked-title" href={`/contents/${encodeURIComponent(linked.id)}`}>{linked.title.slice(0, 24)} · 查看作品详情 →</Link>
                            <div className="kcard-linked-nums">
                              播放 {fmt(linked.plays)} · 赞 {fmt(linked.likes)} · 点赞率{' '}
                              {interRate(linked.likes, linked.plays) == null ? '—' : `${interRate(linked.likes, linked.plays)!.toFixed(1)}%`}
                              {linked.completion != null &&
                                ` · 完播 ${(linked.completion * 100).toFixed(2)}%`}
                            </div>
                            <form action={unlinkContent}>
                              <input type="hidden" name="id" value={t.id} />
                              <button className="kbtn muted" type="submit">
                                解除
                              </button>
                            </form>
                          </>
                        ) : (
                          <form action={linkContent} className="kcard-link-form">
                            <input type="hidden" name="id" value={t.id} />
                            <select name="contentId" className="ksel" defaultValue="">
                              <option value="" disabled>
                                关联到哪条作品？
                              </option>
                              {contents.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.title.slice(0, 22)}
                                </option>
                              ))}
                            </select>
                            <button className="kbtn" type="submit">
                              关联
                            </button>
                          </form>
                        )}
                      </div>
                    )}

                    <div className="kcard-foot">
                      <span className="pill" style={{ fontSize: 10 }}>
                        {SOURCE_LABEL[t.source] ?? t.source}
                      </span>
                      <div style={{ flex: 1 }} />
                      {col.next && (
                        <form action={moveTopic}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="status" value={col.next} />
                          <button className="kbtn" type="submit">
                            {col.nextLabel} →
                          </button>
                        </form>
                      )}
                      <form action={moveTopic}>
                        <input type="hidden" name="id" value={t.id} />
                        <input type="hidden" name="status" value="dropped" />
                        <button className="kbtn muted" type="submit">
                          弃
                        </button>
                      </form>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <div className="note">
        ✦ 每条选题都带着「依据」——来自你的哪条数据、哪个爆款、哪个热榜词。拍完在「已发布」里关联作品，
        就能看到这条选题实际跑成什么样。当前 {active.length} 条在流程中，{all.filter((t) => t.status === 'published').length} 条已发布。
      </div>
    </>
  );
}
