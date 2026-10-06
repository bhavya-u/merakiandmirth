import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const app = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const implementation = app.slice(app.indexOf('const preparedUploads ='), app.indexOf('\nasync function saveProduct'));
function setup(failure) {
  const objects = new Set(), calls = [];
  let preparations = 0, failed = false;
  const context = vm.createContext({
    ProductImages: { prepare: async () => { preparations++; return { thumb: {}, grid: {}, export: {}, detail: {} }; } },
    uuid: () => 'test-version', user: { id: 'local-owner' },
    db: { storage: { from: () => ({
      upload: async (path, blob, options) => {
        assert.equal(options.upsert, false);
        assert.equal(options.cacheControl, '31536000');
        calls.push(path);
        if (!failed && path.endsWith('/grid.webp')) {
          failed = true;
          if (failure === 'lost-response') objects.add(path);
          return { error: { statusCode: '503' } };
        }
        if (objects.has(path)) return { error: { statusCode: '409' } };
        objects.add(path); return { error: null };
      },
      getPublicUrl: path => ({ data: { publicUrl: path } })
    }) } }
  });
  vm.runInContext(implementation, context);
  return { upload: context.uploadImage, calls, objects, preparations: () => preparations };
}
for (const failure of ['before-write', 'lost-response']) test(`upload retry recovers ${failure} without repeating completed variants`, async () => {
  const h = setup(failure), file = {};
  await assert.rejects(h.upload(file));
  const url = await h.upload(file);
  assert.equal(url, 'local-owner/variants-v1/test-version/grid.webp');
  assert.equal(h.objects.size, 4);
  assert.equal(h.preparations(), 1);
  assert.equal(h.calls.filter(p => p.endsWith('/thumb.webp')).length, 1);
  assert.equal(h.calls.filter(p => p.endsWith('/grid.webp')).length, 2);
  const count = h.calls.length;
  assert.equal(await h.upload(file), url);
  assert.equal(h.calls.length, count);
});

test('native sharing writes the PDF to cache and forwards its URI', async () => {
  const calls = [];
  const context = vm.createContext({
    FileReader: class { readAsDataURL() { this.result = 'data:application/pdf;base64,JVBERg=='; this.onload(); } },
    window: { Capacitor: { Plugins: {
      Filesystem: { writeFile: async options => { calls.push(options); return { uri: 'content://local/sample.pdf' }; } },
      Share: { share: async options => { calls.push(options); } }
    } } }
  });
  vm.runInContext(app.slice(app.indexOf('async function shareNativePdf('), app.indexOf('\nfunction cataloguePages')), context);
  await context.shareNativePdf({ output: kind => { assert.equal(kind, 'blob'); return {}; } }, 'sample.pdf', 'Sample');
  assert.equal(calls[0].directory, 'CACHE');
  assert.equal(calls[0].data, 'JVBERg==');
  assert.equal(calls[1].url, 'content://local/sample.pdf');
});
