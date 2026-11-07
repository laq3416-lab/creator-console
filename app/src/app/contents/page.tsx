import Link from 'next/link';
import { getContents } from '@/db/queries';
import { fmt, interRate, diagnose, rateText, MIN_SAMPLE, PLATFORMS, type Platform } from '@/lib/format';
import EmptyState from '@/components/EmptyState';

export const dynamic = 'force-dynamic';

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'douyin', label: '抖音' },
  { key: 'xhs', label: '小红书' },
  { key: 'xianyu', label: '闲鱼' },
];

export default async function ContentsPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const sp = await searchParams;
  const p = sp.p && sp.p !== 'all' ? (sp.p as Platform) : undefined;
  const rows = getContents(p);
  const active = p ?? 'all';

  return (
    <>
      <div className="toolbar">
        {FILTERS.map((f) => (
          <Link key={f.key} href={f.key === 'all' ? '/contents' : `/contents?p=${f.key}`} className={`chip${active === f.key ? ' on' : ''}`}>
            {f.label}
          </Link>
        ))}
        <div style={{ flex: 1 }} />
        <button className="btn ghost">导出 CSV</button>
        <button className="btn ghost" disabled>
          手动录入
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="▤"
          title="作品库还是空的"
          desc="采集服务接通后，抖音、小红书、闲鱼的作品会自动入库，这里按播放量、互动率排序展示。"
          steps={['先接入抖音创作者后台（数据最全）', '再补小红书和闲鱼的公开页采集']}
        />
      ) : (
      <div className="card tbl-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: '32%' }}>作品</th>
              <th>平台</th>
              <th>类型</th>
              <th>发布</th>
              <th style={{ textAlign: 'right' }}>播放</th>
              <th style={{ textAlign: 'right' }}>点赞</th>
              <th style={{ textAlign: 'right' }}>评论</th>
              <th style={{ textAlign: 'right' }}>收藏</th>
              <th>互动率</th>
              <th>诊断</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => {
              const rate = interRate(c.likes, c.plays);
              const v = diagnose(c.plays, rate);
              const verdict = (
                <span
                  className="pill"
                  style={
                    v.tone === 'red'
                      ? { color: 'var(--red)', borderColor: 'var(--red)', background: 'var(--red-bg)' }
                      : v.tone === 'green'
                        ? { color: 'var(--green)', borderColor: 'var(--green)', background: 'var(--green-bg)' }
                        : { color: 'var(--text3)' }
                  }
                >
                  {v.label}
                </span>
              );
              return (
                <tr key={c.id}>
                  <td>
                    <Link href={`/contents/${c.id}`} className="t-title" style={{ color: 'inherit' }}>
                      <div className="t-thumb">{c.type === 'video' ? '▶' : c.type === 'note' ? '▤' : '▣'}</div>
                      <div>
                        <b>{c.title}</b>
                        <span>
                          {PLATFORMS[c.platform as Platform].name}
                          {c.durationSec ? ` · ${c.durationSec} 秒` : ''}
                        </span>
                      </div>
                    </Link>
                  </td>
                  <td>
                    <span className="pill">{PLATFORMS[c.platform as Platform].name}</span>
                  </td>
                  <td style={{ color: 'var(--text2)', fontSize: 12 }}>
                    {c.type === 'video' ? '视频' : c.type === 'note' ? '图文' : '商品'}
                  </td>
                  <td className="num" style={{ color: 'var(--text3)' }}>
                    {new Date(c.publishedAt).toLocaleString('zh-CN', {
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>{fmt(c.plays)}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{fmt(c.likes)}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{c.comments}</td>
                  <td className="num" style={{ textAlign: 'right' }}>{fmt(c.saves)}</td>
                  <td>
                    <div className="rate">
                      <span className="num">{rateText(c.plays, rate)}</span>
                      <div className="rate-bar">
                        <i style={{ width: c.plays >= MIN_SAMPLE ? `${Math.min(100, rate * 12)}%` : '0%' }} />
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {verdict}
                      <Link href={`/contents/${c.id}`} style={{ color: 'var(--text3)', fontSize: 16 }}>
                        ›
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={10} style={{ padding: 32, color: 'var(--text3)' }}>
                  该平台暂无作品
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      )}

      <div className="note">
        诊断列由规则引擎给出，阈值可在设置页调整；点行进详情可看完整证据链。当前为 M1 阶段，详情页尚未实现。
      </div>
    </>
  );
}
