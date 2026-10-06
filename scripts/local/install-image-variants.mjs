import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { root, api, status, request } from './common.mjs';
const key = status().SERVICE_ROLE_KEY;
const productIndex = process.argv.indexOf('--product');
const selectedProduct = productIndex >= 0 ? process.argv[productIndex + 1] : null;
if (productIndex >= 0 && (!selectedProduct || selectedProduct.startsWith('--'))) throw new Error('--product requires an ID');
const dryRun = process.argv.includes('--dry-run');
const rollbackIndex = process.argv.indexOf('--rollback');
const batch = rollbackIndex >= 0 ? process.argv[rollbackIndex + 1] : randomUUID();
if (!/^[a-f0-9-]{36}$/i.test(batch || '')) throw new Error('A valid batch UUID is required');
const rpc = (name, body) => request(`/rest/v1/rpc/${name}`, { key, method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });
if (rollbackIndex >= 0) {
  const entries = await request(`/rest/v1/image_migration_history?batch_id=eq.${batch}&select=*`, { key });
  if (!entries.length) throw new Error('No history for this batch');
  let conflicts = 0;
  for (const entry of entries) {
    const result = dryRun ? 'rollback candidate (URL checked when applied)' : await rpc('rollback_image_migration', { p_batch: batch, p_product: entry.product_id });
    console.log(entry.product_id, result);
    if (['conflict', 'missing', 'missing_history'].includes(result)) conflicts++;
  }
  if (!dryRun) await writeFile(`${root}/.local/image-variants/history-${batch}.json`, JSON.stringify(await request(`/rest/v1/image_migration_history?batch_id=eq.${batch}&select=*`, { key }), null, 2));
  if (conflicts) { console.error(`${conflicts} rollback entries need review; later edits preserved.`); process.exitCode = 1; }

  process.exit(process.exitCode || 0);
}
console.log(`Batch: ${batch}${dryRun ? ' (dry run)' : ''}`);
const manifest = JSON.parse(await readFile(`${root}/.local/image-variants/manifest.json`, 'utf8'));
const rows = await request('/rest/v1/library_items?kind=eq.product&select=id,photo', { key });
if (!dryRun) await writeFile(`${root}/.local/image-variants/rollback-${batch}.json`, JSON.stringify({ batch, rows }, null, 2));
let count = 0;
try {
for (const product of manifest) {
  if (selectedProduct && product.id !== selectedProduct) continue;
  const row = rows.find(row => row.id === product.id);
  if (!row || !row.photo.startsWith(`${api}/storage/v1/object/public/catalogue/`)) continue;
  const newUrl = `${api}/storage/v1/object/public/catalogue/${product.variants.grid.path}`;
  if (row.photo === newUrl) continue;
  if (dryRun) { console.log(product.id, 'would migrate'); count++; continue; }
  for (const variant of Object.values(product.variants)) {
    // Content-addressed local fixtures: reusing an existing object is safe.
    const head = await fetch(`${api}/storage/v1/object/public/catalogue/${variant.path}`, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!head.ok && head.status !== 404 && head.status !== 400) throw new Error(`Image verification failed: ${head.status}`);
    if (!head.ok) await request(`/storage/v1/object/catalogue/${variant.path}`, { key, method: 'POST', body: await readFile(variant.file), headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'max-age=31536000' } });
    const verified = await fetch(`${api}/storage/v1/object/public/catalogue/${variant.path}`, { method: 'HEAD', redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!verified.ok || Number(verified.headers.get('content-length')) !== variant.bytes || !verified.headers.get('content-type')?.startsWith('image/webp')) throw new Error(`Invalid uploaded variant: ${variant.path}`);
  }
  const result = await rpc('apply_image_migration', { p_batch: batch, p_product: row.id, p_previous: row.photo, p_new: newUrl });
  if (result !== 'applied' && result !== 'already_applied') throw new Error(`${row.id}: ${result}; migration stopped safely`);
  count++;
}
} finally {
if (!dryRun) await writeFile(`${root}/.local/image-variants/history-${batch}.json`, JSON.stringify(await request(`/rest/v1/image_migration_history?batch_id=eq.${batch}&select=*`, { key }), null, 2));
}
console.log(dryRun ? `${count} local products would change; no writes performed.` : `Processed ${count} local products; backup and history saved for batch ${batch}.`);
