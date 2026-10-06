// Local-only measurement: same-origin proxy exposes Resource Timing byte counts.
// This measures browser cache behaviour, not Supabase's hosted CDN accounting.
(() => {
  const run = new URLSearchParams(location.search).get('benchmark');
  if (!run || !/^[a-z0-9-]{1,64}$/.test(run)) return;
  const original = window.imageSource;
  window.imageSource = function (...args) {
    const source = original(...args);
    return source.replace('http://127.0.0.1:54321/storage/v1/object/public/', `/_storage/${run}/`);
  };
  const panel = document.createElement('details');
  panel.id = 'local-performance';
  panel.style.cssText = 'position:fixed;right:8px;top:8px;z-index:10000;background:#fff;color:#111;border:1px solid #333;padding:8px;max-width:90vw;font:12px monospace';
  panel.innerHTML = '<summary>Local image measurements</summary><pre></pre>';
  document.body.append(panel);
  const refresh = () => {
    const rows = performance.getEntriesByType('resource').filter(r => r.name.includes('/_storage/'));
    panel.querySelector('pre').textContent = JSON.stringify({
      run, entries: rows.length, uniqueUrls: new Set(rows.map(r => r.name)).size,
      responseBodyBytes: rows.filter(r => r.transferSize > 0).reduce((n, r) => n + r.encodedBodySize, 0),
      networkResponses: rows.filter(r => r.transferSize > 0).length,
      cacheHits: rows.filter(r => r.transferSize === 0 && r.decodedBodySize > 0).length,
      pendingImages: [...document.images].filter(i => i.src.includes('/_storage/') && !i.complete).length,
      failedImages: [...document.images].filter(i => i.src.includes('/_storage/') && i.complete && !i.naturalWidth).length,
    }, null, 2);
  };
  setInterval(refresh, 1000);
})();
