import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { root, status } from './common.mjs';
const settings = status();
const config = { url: settings.API_URL, anonKey: settings.ANON_KEY, environment: 'local', disableNotifications: true };
if (!config.anonKey) throw new Error('Local anon key missing.');
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' http://127.0.0.1:54321 data: blob:; connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const allowed = new Set(['product-images.js', 'app.js', 'styles.css', 'manifest.webmanifest', 'flow.css', 'overrides.css', 'review-fixes.css']);
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.headers.host !== '127.0.0.1:4173' && req.headers.host !== 'localhost:4173') { res.writeHead(403); return res.end(); }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1:4173').pathname);
    let data, type = 'text/javascript';
    if (pathname.startsWith('/_storage/')) {
      const match = pathname.match(/^\/_storage\/[a-z0-9-]{1,64}\/(catalogue\/[^?]+)$/);
      if (!match || match[1].includes('..')) { res.writeHead(400); return res.end(); }
      const upstream = await fetch(settings.API_URL + '/storage/v1/object/public/' + match[1].split('/').map(encodeURIComponent).join('/'), { redirect: 'error', signal: AbortSignal.timeout(15000) });
      res.setHeader('Content-Type', upstream.headers.get('content-type') || 'application/octet-stream');
      res.setHeader('Cache-Control', upstream.ok ? (upstream.headers.get('cache-control') || 'no-store') : 'no-store');
      res.writeHead(upstream.status);
      return res.end(req.method === 'HEAD' ? undefined : Buffer.from(await upstream.arrayBuffer()));
    }
    if (pathname === '/image-checks') { data = '<!doctype html><title>Local image checks</title><pre>Running…</pre><script src="/product-images.js"></script><script src="/image-checks.js"></script>'; type = 'text/html'; }
    else if (pathname === '/image-checks.js') data = await readFile(`${root}/scripts/local/image-checks.js`);
    else if (pathname === '/performance-observer.js') data = await readFile(`${root}/scripts/local/performance-observer.js`);
    else if (pathname === '/supabase-config.js') data = `window.SUPABASE_CONFIG = ${JSON.stringify(config)};`;
    else if (pathname === '/' || pathname === '/index.html') {
      data = (await readFile(`${root}/index.html`, 'utf8'))
        .replace(/<link[^>]+https:\/\/fonts\.[^>]+>/g, '')
        .replace('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', '/vendor/supabase.js')
        .replace('<body class="auth-pending">', '<body class="auth-pending"><div style="background:#fff3cd;color:#513d00;padding:8px;text-align:center">LOCAL TEST ENVIRONMENT — sample data · Telegram disabled</div>');
      if (new URL(req.url, 'http://127.0.0.1:4173').searchParams.has('benchmark')) data = data.replace('</body>', '<script src="/performance-observer.js"></script></body>');
      type = 'text/html';
    } else {
      let path;
      if (pathname === '/vendor/supabase.js') path = `${root}/node_modules/@supabase/supabase-js/dist/umd/supabase.js`;
      else if (pathname === '/vendor/jspdf.umd.min.js') path = `${root}/node_modules/jspdf/dist/jspdf.umd.min.js`;
      else if (allowed.has(pathname.slice(1))) path = `${root}${pathname}`;
      else if (pathname.startsWith('/assets/')) {
        path = resolve(root, '.' + pathname);
        if (!path.startsWith(resolve(root, 'assets') + sep)) { res.writeHead(403); return res.end(); }
      } else { res.writeHead(404); return res.end(); }
      data = await readFile(path);
      type = types[extname(path)] || 'application/octet-stream';
      if (pathname.startsWith('/assets/')) res.setHeader('Cache-Control', 'public, max-age=3600');
    }
    res.setHeader('Content-Type', type);
    res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
server.listen(4173, '127.0.0.1', () => console.log('Local test app: http://127.0.0.1:4173 (production connections blocked)'));
