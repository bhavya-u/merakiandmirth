import { readFile, writeFile } from 'node:fs/promises';
import { root, api, status, request } from './common.mjs';
const key = status().SERVICE_ROLE_KEY;
const manifest = JSON.parse(await readFile(`${root}/.local/image-variants/manifest.json`, 'utf8'));
const rows = await request('/rest/v1/library_items?kind=eq.product&select=id,photo', { key });
await writeFile(`${root}/.local/image-variants/rollback-${Date.now()}.json`, JSON.stringify(rows, null, 2));
let count = 0;
for (const product of manifest) {
  const row = rows.find(row => row.id === product.id);
  if (!row || !row.photo.startsWith(`${api}/storage/v1/object/public/catalogue/`)) continue;
  for (const variant of Object.values(product.variants)) {
    // Content-addressed local fixtures: reusing an existing object is safe.
    const head = await fetch(`${api}/storage/v1/object/public/catalogue/${variant.path}`, { method: 'HEAD' });
    if (!head.ok) await request(`/storage/v1/object/catalogue/${variant.path}`, { key, method: 'POST', body: await readFile(variant.file), headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'max-age=31536000' } });
  }
  await request(`/rest/v1/library_items?id=eq.${encodeURIComponent(row.id)}&photo=eq.${encodeURIComponent(row.photo)}`, { key, method: 'PATCH', body: JSON.stringify({ photo: `${api}/storage/v1/object/public/catalogue/${product.variants.grid.path}` }), headers: { 'Content-Type': 'application/json' } });
  count++;
}
console.log(`Installed variants for ${count} local products. Previous references saved in ignored rollback file.`);
