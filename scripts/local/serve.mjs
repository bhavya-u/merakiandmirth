import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { root, status } from './common.mjs';
const settings = status();
const config = { url: settings.API_URL, anonKey: settings.ANON_KEY, environment: 'local', disableNotifications: true };
if (!config.anonKey) throw new Error('Local anon key missing.');
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' http://127.0.0.1:54321 data: blob:; connect-src 'self' http://127.0.0.1:54321 ws://127.0.0.1:54321; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
const allowed = new Set(['app.js', 'styles.css', 'manifest.webmanifest', 'flow.css', 'overrides.css', 'review-fixes.css']);
const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Security-Policy', csp);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    if (req.headers.host !== '127.0.0.1:4173' && req.headers.host !== 'localhost:4173') { res.writeHead(403); return res.end(); }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    const pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1:4173').pathname);
    let data, type = 'text/javascript';
    if (pathname === '/supabase-config.js') data = `window.SUPABASE_CONFIG = ${JSON.stringify(config)};`;
    else if (pathname === '/' || pathname === '/index.html') {
      data = (await readFile(`${root}/index.html`, 'utf8'))
        .replace(/<link[^>]+https:\/\/fonts\.[^>]+>/g, '')
        .replace('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2', '/vendor/supabase.js')
        .replace('<body class="auth-pending">', '<body class="auth-pending"><div style="background:#fff3cd;color:#513d00;padding:8px;text-align:center">LOCAL TEST ENVIRONMENT — sample data · Telegram disabled</div>');
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
