import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { root, status, request, sql } from './common.mjs';
const settings = status();
const key = settings.SERVICE_ROLE_KEY;
if (!key) throw new Error('Local service-role key missing.');
// Disable all local cron dispatch before creating fixture records.
sql('select cron.unschedule(jobid) from cron.job;');
const credentialsPath = `${root}/.local/test-accounts.json`;
let saved;
try { saved = JSON.parse(await readFile(credentialsPath, 'utf8')); } catch { saved = {}; }
const accounts = {};
const users = (await request('/auth/v1/admin/users', { key })).users;
for (const name of ['owner', 'staff', 'outsider']) {
  const email = `${name}@example.test`;
  const password = saved[name]?.password || randomBytes(18).toString('base64url');
  const existing = users.find(user => user.email === email);
  const result = await request(`/auth/v1/admin/users${existing ? '/' + existing.id : ''}`, {
    key, method: existing ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, email_confirm: true })
  });
  accounts[name] = { email, password, id: result.id };
}
await mkdir(`${root}/.local`, { recursive: true });
await writeFile(credentialsPath, JSON.stringify(accounts, null, 2) + '\n', { mode: 0o600 });
let count = 0;
for (const filename of await readdir(`${root}/assets/catalogue-webp`)) {
  const id = filename.match(/--(p\d{5})\.webp$/)?.[1];
  if (!id) continue;
  const data = await readFile(`${root}/assets/catalogue-webp/${filename}`);
  await request(`/storage/v1/object/catalogue/seed-products/${id}.webp`, {
    key, method: 'POST', body: data,
    headers: { 'Content-Type': 'image/webp', 'x-upsert': 'true', 'Cache-Control': 'max-age=31536000' }
  });
  count++;
}
const owner = accounts.owner.id;
if (!/^[a-f0-9-]{36}$/.test(owner)) throw new Error('Invalid local user ID.');
sql(`
insert into public.clients (id, owner_id, name, mobile_number, delivery_area)
values ('10000000-0000-4000-8000-000000000001', '${owner}', 'Sample Client', '9000000001', 'Local test address')
on conflict (id) do nothing;
insert into public.vendors (owner_id, name, phone) values ('${owner}', 'Sample Supplier', '9000000002') on conflict (name) do nothing;
insert into public.library_items (id, owner_id, kind, name, cost, contents, component_ids, occasions)
values ('local-combo-01', '${owner}', 'combo', 'Local Celebration Set', 500, '{"margin":30}', ARRAY['p00001','p00002','p00003'], ARRAY['all']) on conflict (id) do nothing;
insert into public.orders (id, owner_id, code, title, event, qty, total, status, customer_name, customer_phone, client_id, combo_id, items)
values ('20000000-0000-4000-8000-000000000001', '${owner}', 'LOCAL-001', 'Sample Quotation', 'all', 10, 5000, 'Quotation sent', 'Sample Client', '9000000001', '10000000-0000-4000-8000-000000000001', 'local-combo-01', '[{"comboId":"local-combo-01","comboName":"Local Celebration Set","pricePerCombo":500,"unitCost":350}]') on conflict (id) do nothing;
`);
console.log(`Seeded local owner/staff/outsider accounts, sample business records, and ${count} WebPs.`);
console.log('Test credentials: .local/test-accounts.json (ignored by Git; local only).');
