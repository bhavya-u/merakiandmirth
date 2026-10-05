import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { root, api, status, request, sql } from './common.mjs';
const settings = status();
const key = settings.ANON_KEY;
assert.equal(sql("select count(*) from public.library_items where id = 'local-combo-01'"), '1');
assert.equal(sql("select count(*) from public.orders where code = 'LOCAL-001'"), '1');
assert.equal(sql("select count(*) from auth.users where email in ('owner@example.test','staff@example.test','outsider@example.test')"), '3');
const accounts = JSON.parse(await readFile(`${root}/.local/test-accounts.json`, 'utf8'));
assert.equal(sql('select count(*) from cron.job'), '0', 'No local scheduled outbound jobs');
assert.equal(sql('select count(*) from vault.secrets'), '0', 'No production secrets imported');
assert.equal(sql("select count(*) from public.library_items where photo like '%supabase.co%'"), '0', 'No hosted image references');
let ownerToken, outsiderToken;
for (const name of ['owner', 'staff', 'outsider']) {
  const session = await request('/auth/v1/token?grant_type=password', {
    key, method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: accounts[name].email, password: accounts[name].password })
  });
  const token = session.access_token;
  if (name === 'owner') ownerToken = token;
  if (name === 'outsider') outsiderToken = token;
  const access = await request('/rest/v1/rpc/workspace_access_state', {
    key, token, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
  });
  assert.equal(access.member, name !== 'outsider');
  const products = await request('/rest/v1/library_items?kind=eq.product&select=id,photo', { key, token });
  assert.equal(products.length, name === 'outsider' ? 0 : 88);
  if (name !== 'outsider') {
    const checks = ['orders', 'occasion_types', 'expense_claims', 'expense_rate_policies', 'clients', 'vendors'];
    for (const table of checks) await request(`/rest/v1/${table}?select=*&limit=1`, { key, token });
    await request('/rest/v1/rpc/workspace_expense_people', { key, token, method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  }
}
assert.deepEqual(await request('/rest/v1/library_items?select=id', { key }), [], 'Anonymous cannot read business data');
const file = await readFile(`${root}/assets/catalogue-webp/300 ml Bunny Glass Bottle--p00001.webp`).catch(() => null);
// Verify all seeded images really exist, not just their DB references.
const images = await request('/rest/v1/library_items?kind=eq.product&select=photo', { key, token: ownerToken });
for (const { photo } of images) {
  assert.ok(photo.startsWith(api + '/storage/v1/object/public/catalogue/'));
  const response = await fetch(photo, { method: 'HEAD', redirect: 'error' });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /image\/webp/);
}
for (const token of [key, outsiderToken]) {
  const denied = await fetch(`${api}/storage/v1/object/catalogue/unauthorized-test.webp`, {
    method: 'POST', headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'image/webp' }, body: file || new Uint8Array([1])
  });
  assert.ok(!denied.ok, 'Anonymous and non-member uploads rejected');
}
const imageBytes = await (await fetch(images[0].photo)).arrayBuffer();
const testPath = `local-tests/${crypto.randomUUID()}.webp`;
await request(`/storage/v1/object/catalogue/${testPath}`, {
  key, token: ownerToken, method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: imageBytes
});
await request('/storage/v1/object/catalogue', {
  key, token: ownerToken, method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prefixes: [testPath] })
});
const page = await fetch('http://127.0.0.1:4173');
assert.equal(page.status, 200);
const html = await page.text();
assert.ok(!html.includes('cdn.jsdelivr.net'));
assert.match(page.headers.get('content-security-policy'), /connect-src 'self' http:\/\/127.0.0.1:54321/);
const config = await (await fetch('http://127.0.0.1:4173/supabase-config.js')).text();
assert.ok(!config.includes(settings.SERVICE_ROLE_KEY));
assert.ok(!config.includes('supabase.co'));
assert.match(config, /"disableNotifications":true/);
for (const path of ['/.env', '/.local/test-accounts.json', '/supabase/seed.sql', '/package.json']) {
  assert.equal((await fetch('http://127.0.0.1:4173' + path)).status, 404);
}
console.log('PASS: local auth, member/outsider isolation, workspace queries, 88 images, anonymous upload denial, no cron/secrets/production URLs, and safe dev server.');
