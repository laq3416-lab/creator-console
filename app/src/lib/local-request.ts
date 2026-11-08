/** 本地写入接口只接受本机主机名及同源浏览器请求。 */
export function isLocalWrite(req: Request): boolean {
  try {
    const requestUrl = new URL(req.url);
    const host = req.headers.get('host');
    if (!host) return false;
    const target = new URL(`${requestUrl.protocol}//${host}`);
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname) || target.username || target.password) return false;
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).origin !== target.origin) return false;
    const site = req.headers.get('sec-fetch-site');
    if (site && site !== 'same-origin' && site !== 'none') return false;
    return true;
  } catch { return false; }
}
