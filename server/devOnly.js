// The dev routes of server/index.js write files: this computer only. A tunnel or a reverse proxy (Cloudflare Tunnel, nginx) connects from 127.0.0.1 itself, so the address of the
// socket says nothing behind one: any proxy header, or a Host that is not localhost, closes them as well, and so does NODE_ENV=production.
const LOCAL_SOCKET = /^(::1|127\.0\.0\.1|::ffff:127\.0\.0\.1)$/;
const LOCAL_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;
const PROXY_HEADERS = ['x-forwarded-for', 'x-forwarded-host', 'forwarded', 'x-real-ip', 'cf-connecting-ip', 'cf-ray'];

export function devOnly(req, env = process.env) {
  const proxied = PROXY_HEADERS.some((h) => req.headers[h] !== undefined);
  const host = String(req.headers.host || '').replace(/:\d+$/, '');
  return LOCAL_SOCKET.test(req.socket?.remoteAddress || '') && !proxied && LOCAL_HOST.test(host) && env.NODE_ENV !== 'production';
}
