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
  const host = new URL(u).hostname;
  if (!/douyinpic\.com$|xhscdn\.com$|byteimg\.com$|douyinvod\.com$|aliyuncs\.com$|alicdn\.com$/.test(host)) {
    return new NextResponse('host not allowed', { status: 403 });
  }

  try {
    const res = await fetch(u, {
      headers: {
        Referer: /xhscdn|xhs/.test(host) ? 'https://www.xiaohongshu.com/' : 'https://www.douyin.com/',
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
      },
    });
    if (!res.ok) return new NextResponse('upstream error', { status: 502 });

    const buf = await res.arrayBuffer();
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
