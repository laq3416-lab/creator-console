import { getMyProducts, getProductBenchmark, getBenchmarkProducts } from '@/db/queries';
import { relTime } from '@/lib/format';
import EmptyState from '@/components/EmptyState';

export const dynamic = 'force-dynamic';

const yuan = (v: number | null) => (v == null ? '—' : `¥${v.toLocaleString('zh-CN')}`);

/** 标题结构诊断：能看出「有没有把人搜得到的关键词写进去」 */
function titleCheck(title: string) {
  const t = title.trim();
  const issues: string[] = [];
  // 只提真的能提高搜索命中率的问题，不苛求
  if (t.length < 8) issues.push('标题太短，搜不到');
  if (!/[\u4e00-\u9fa5]{2,}/.test(t)) issues.push('缺少中文关键词');
  // 服务类和实物类都适用：明确交付形式或成色
  if (!/包邮|可小刀|急出|当天|24小时|全新|自用|闲置|9成|8成|成品|模板|可改/.test(t))
    issues.push('可以补一句交付方式或成色');
  return issues;
}

export default function ProductsPage() {
  const mine = getMyProducts();
  const bench = getProductBenchmark();
  const peers = getBenchmarkProducts();

  if (mine.length === 0 && peers.length === 0) {
    return (
      <EmptyState
        icon="▣"
        title="还没有闲鱼商品数据"
        desc="闲鱼网页版只提供商品本体（标题、价格、状态）。曝光、浏览、想要、成交这些经营数据在闲管家或 App 里。"
        steps={[
          '在设置页登录闲鱼（独立登录态，不影响抖音）',
          '采集你在售的商品：标题、价格、状态',
          '根据自己的价格区间判断定价是否合理',
        ]}
        cta="去设置页登录"
      />
    );
  }

  const prices = mine.map((p) => p.price).filter((p): p is number => p != null && p > 0).sort((a, b) => a - b);
  const median = prices.length ? prices[Math.floor(prices.length / 2)] : null;

  return (
    <>
      <div className="note" style={{ marginTop: 0, marginBottom: 14, borderColor: 'var(--amber)' }}>
        ⚠ 能力边界：闲鱼网页版<b>不返回</b>曝光、浏览、想要、成交。这些只有「闲管家」（goofish.pro）或闲鱼 App 的卖家中心才有。
        所以这页现在只做<b>商品清单 + 定价诊断 + 标题结构</b>，不编造点击数据。
      </div>

      <div className="grid g4">
        <div className="card kpi">
          <div className="kpi-label">在售商品</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>
            {mine.length}
          </div>
          <div className="kpi-meta">
            <span>件</span>
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">价格中位</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>
            {yuan(median)}
          </div>
          <div className="kpi-meta">
            <span>
              {yuan(prices[0] ?? null)} – {yuan(prices[prices.length - 1] ?? null)}
            </span>
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">同类价格区间</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>
            {bench ? `${yuan(bench.price.p25)}–${yuan(bench.price.p75)}` : '—'}
          </div>
          <div className="kpi-meta">
            <span>{bench ? `${bench.count} 件同行样本` : '还没抓同类'}</span>
          </div>
        </div>
        <div className="card kpi">
          <div className="kpi-label">标题可优化的</div>
          <div className="kpi-value" style={{ fontSize: 22 }}>
            {mine.filter((p) => titleCheck(p.title).length > 0).length}
          </div>
          <div className="kpi-meta">
            <span>共 {mine.length} 件</span>
          </div>
        </div>
      </div>

      <div className="sec-head">
        <h2>我的在售商品</h2>
        <span className="hint">点「诊断」看具体问题和改法</span>
      </div>

      <div className="card tbl-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: '46%' }}>商品</th>
              <th style={{ textAlign: 'right' }}>价格</th>
              <th>vs 同类中位</th>
              <th>标题诊断</th>
            </tr>
          </thead>
          <tbody>
            {mine.map((p) => {
              const issues = titleCheck(p.title);
              const vsBench =
                p.price != null && bench?.price.median != null
                  ? p.price > bench.price.median * 1.3
                    ? '偏高'
                    : p.price < bench.price.median * 0.7
                      ? '偏低'
                      : '正常'
                  : '—';
              return (
                <tr key={p.id}>
                  <td>
                    <div className="t-title">
                      <div className="t-thumb">▣</div>
                      <div>
                        <b>{p.title}</b>
                        <span>{relTime(p.publishedAt)}</span>
                      </div>
                    </div>
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    {yuan(p.price)}
                  </td>
                  <td>
                    <span
                      className="pill"
                      style={
                        vsBench === '偏高'
                          ? { color: 'var(--red)', background: 'var(--red-bg)', borderColor: 'var(--red)' }
                          : vsBench === '偏低'
                            ? { color: 'var(--green)', background: 'var(--green-bg)', borderColor: 'var(--green)' }
                            : {}
                      }
                    >
                      {vsBench}
                    </span>
                  </td>
                  <td>
                    {issues.length === 0 ? (
                      <span className="pill" style={{ color: 'var(--green)' }}>
                        没问题
                      </span>
                    ) : (
                      <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{issues.join('；')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="sec-head">
        <h2>同类商品</h2>
        <span className="hint">{peers.length} 件</span>
      </div>

      {!bench ? (
        <div className="card empty-sm" style={{ padding: '30px 20px', lineHeight: 1.8 }}>
          还没抓同类商品。要抓的话，得知道搜什么关键词——你的商品标题里现在最多的是
          「{mine[0]?.title.slice(0, 12)}」这类。
          <br />
          告诉我你想对标的关键词（比如「二手 iPad」「二手教材」），我按那个搜。
        </div>
      ) : (
        <div className="card tbl-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: '50%' }}>同类商品</th>
                <th style={{ textAlign: 'right' }}>价格</th>
                <th>卖家</th>
                <th>关键词</th>
              </tr>
            </thead>
            <tbody>
              {peers.slice(0, 12).map((p) => (
                <tr key={p.id}>
                  <td>
                    <div className="t-title">
                      <div className="t-thumb">▣</div>
                      <b>{p.title}</b>
                    </div>
                  </td>
                  <td className="num" style={{ textAlign: 'right' }}>
                    {yuan(p.price)}
                  </td>
                  <td style={{ fontSize: 11.5, color: 'var(--text3)' }}>{p.sellerName ?? '—'}</td>
                  <td>
                    <span className="pill">{p.keyword ?? '—'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="note">
        ✦ 闲鱼想提高成交，能自己控制的只有三样：<b>价格</b>、<b>标题关键词</b>、<b>首图</b>。
        前两个现在能自动诊断，第三个需要看你的图，暂时做不了。
      </div>
    </>
  );
}
