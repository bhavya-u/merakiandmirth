import test from 'node:test';
import assert from 'node:assert/strict';
import '../product-images.js';
test('versioned photos resolve each size without changing legacy URLs', () => {
  const base = 'https://example.test/storage/catalogue/user/variants-v1/abc/grid.webp';
  assert.equal(ProductImages.source(base, 'thumb'), base.replace('grid.webp', 'thumb.webp'));
  assert.equal(ProductImages.source(base + '?token=x', 'export'), base.replace('grid.webp', 'export.webp') + '?token=x');
  assert.equal(ProductImages.source('assets/catalogue-webp/old.webp', 'thumb'), 'assets/catalogue-webp/old.webp');
  assert.equal(ProductImages.source('https://example.test/old.jpg', 'detail'), 'https://example.test/old.jpg');
  assert.throws(() => ProductImages.source(base, '../escape'));
});
test('dimensions preserve portrait/landscape proportions without upscaling', () => {
  assert.deepEqual(ProductImages.fit(1600, 800, 640), [640, 320]);
  assert.deepEqual(ProductImages.fit(800, 1600, 240), [120, 240]);
  assert.deepEqual(ProductImages.fit(100, 80, 640), [100, 80]);
});
test('unsupported or excessive files fail before decoding', async () => {
  await assert.rejects(ProductImages.prepare({ type: 'image/svg+xml', size: 10 }), /JPEG/);
  await assert.rejects(ProductImages.prepare({ type: 'image/png', size: 16000000 }), /15 MB/);
});
