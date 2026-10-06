import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { root, api, status, request } from './common.mjs';
const key = status().SERVICE_ROLE_KEY;
const id = 'p00001';
const endpoint = `/rest/v1/library_items?id=eq.${id}`;
const read = async () => (await request(endpoint + '&select=*', { key }))[0];
const original = await read();
assert.ok(original, 'Local fixture required');
await writeFile(`${root}/.local/image-variants/cli-test-original.json`, JSON.stringify(original, null, 2));
const setPhoto = photo => request(endpoint, { key, method: 'PATCH', body: JSON.stringify({ photo }), headers: { 'Content-Type': 'application/json' } });
function run(args, expected = 0) {
  const result = spawnSync(process.execPath, ['scripts/local/install-image-variants.mjs', ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, expected, result.stdout + result.stderr);
  return result.stdout;
}
const oldUrl = `${api}/storage/v1/object/public/catalogue/seed-products/${id}.webp`;
try {
  await setPhoto(oldUrl);
  assert.match(run(['--product', id, '--dry-run']), /1 local products would change/);
  assert.equal((await read()).photo, oldUrl);
  const output = run(['--product', id]);
  const batch = output.match(/Batch: ([a-f0-9-]+)/)[1];
  const migrated = (await read()).photo;
  assert.match(migrated, /variants-v1/);
  const backup = JSON.parse(await readFile(`${root}/.local/image-variants/rollback-${batch}.json`));
  assert.equal(backup.rows.find(row => row.id === id).photo, oldUrl);
  assert.match(run(['--rollback', batch, '--dry-run']), /rollback candidate/);
  assert.equal((await read()).photo, migrated);
  assert.match(run(['--rollback', batch]), /rolled_back/);
  assert.equal((await read()).photo, oldUrl);
  assert.match(run(['--rollback', batch]), /already_rolled_back/);
  const second = run(['--product', id]).match(/Batch: ([a-f0-9-]+)/)[1];
  assert.equal((await read()).photo, migrated);
  const later = oldUrl + '?later-edit=cli-test';
  await setPhoto(later);
  assert.match(run(['--rollback', second], 1), /conflict/);
  assert.equal((await read()).photo, later);
  // Restore the migration-owned reference, then use the actual rollback command.
  await setPhoto(migrated);
  run(['--rollback', second]);
  const history = JSON.parse(await readFile(`${root}/.local/image-variants/history-${second}.json`));
  assert.equal(history[0].status, 'rolled_back');
  const unchanged = await read();
  for (const field of ['cost', 'buffer', 'stock_on_hand', 'name', 'sku']) assert.deepEqual(unchanged[field], original[field], field);
  console.log('PASS: CLI dry-run, verified apply, external backup, rollback, repeat rollback, reapply, later-edit conflict exit status and business-field preservation.');
} finally {
  await setPhoto(original.photo);
  assert.equal((await read()).photo, original.photo);
  console.log('Original local product image restored.');
}
