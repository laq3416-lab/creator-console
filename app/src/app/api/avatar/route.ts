import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * 头像代理。
 * 抖音/小红书的图床有防盗链，浏览器直接加载大概率 403。
 * 这里由服务端带 Referer 去取，再吐给前端。
 */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get('u');
  if (!u || !/^https:\/\//.test(u)) {
    return new NextResponse('bad url', { status: 400 });
  }

  // 只允许取这几个图床，避免变成开放代理
  let host: string;
  try { host = new URL(u).hostname.toLowerCase(); } catch { return new NextResponse('bad url', { status: 400 }); }
  const allowed = ['douyinpic.com', 'xhscdn.com', 'byteimg.com', 'douyinvod.com', 'aliyuncs.com', 'alicdn.com'];
  if (!allowed.some((domain) => host === domain || host.endsWith('.' + domain))) {
    return new NextResponse('host not allowed', { status: 403 });
  }

  try {
    const res = await fetch(u, {
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
      headers: {
        Referer: /xhscdn|xhs/.test(host) ? 'https://www.xiaohongshu.com/' : 'https://www.douyin.com/',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
      },
    });
    if (!res.ok) return new NextResponse('upstream error', { status: 502 });

    const type = res.headers.get('content-type') ?? '';
    const length = Number(res.headers.get('content-length'));
    if (!type.startsWith('image/') || (length && length > 5_000_000)) return new NextResponse('invalid image', { status: 502 });
    const reader = res.body?.getReader();
    if (!reader) return new NextResponse('empty image', { status: 502 });
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 5_000_000) { await reader.cancel(); return new NextResponse('image too large', { status: 502 }); }
      chunks.push(value);
    }
    const buf = Buffer.concat(chunks);
    return new NextResponse(buf, {
      headers: {
        'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
        'Cache-Control': 'public, max-age=86400, immutable',
      },
    });
  } catch {
    return new NextResponse('fetch failed', { status: 502 });
  }
}
