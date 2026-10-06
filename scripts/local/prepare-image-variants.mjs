import { readFile, readdir, mkdir, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import '../../product-images.js';
const root = resolve(import.meta.dirname, '../..');
const output = resolve(root, '.local/image-variants');
await mkdir(output, { recursive: true });
const manifest = [];
for (const name of (await readdir(`${root}/assets/catalogue`)).filter(n => n.endsWith('.png')).sort()) {
  const input = `${root}/assets/catalogue/${name}`;
  const id = name.match(/--(p\d+)\.png$/)?.[1];
  if (!id) throw new Error(`Missing product ID: ${name}`);
  const version = createHash('sha256').update(await readFile(input)).update(JSON.stringify(ProductImages.specs) + 'webp-q82-72-62-52-v1').digest('hex').slice(0, 24);
  const directory = `${output}/${version}`;
  await mkdir(directory, { recursive: true });
  const dimensions = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', input], { encoding: 'utf8' });
  const width = Number(dimensions.match(/pixelWidth: (\d+)/)[1]), height = Number(dimensions.match(/pixelHeight: (\d+)/)[1]);
  const variants = {};
  for (const [variant, [limit, budget]] of Object.entries(ProductImages.specs)) {
    const [w, h] = ProductImages.fit(width, height, limit);
    const file = `${directory}/${variant}.webp`;
    let bytes;
    for (const quality of [82, 72, 62, 52]) {
      execFileSync('cwebp', ['-quiet', '-resize', String(w), String(h), '-q', String(quality), input, '-o', file]);
      bytes = (await stat(file)).size;
      if (bytes <= budget) break;
    }
    if (bytes > budget) throw new Error(`${id}/${variant} exceeds byte budget`);
    variants[variant] = { file, bytes, width: w, height: h, path: `variants-v1/${version}/${variant}.webp` };
  }
  manifest.push({ id, version, variants });
}
await writeFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ products: manifest.length, bytes: Object.fromEntries(Object.keys(ProductImages.specs).map(v => [v, manifest.reduce((sum, p) => sum + p.variants[v].bytes, 0)])) }, null, 2));
