import { existsSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const catalogueDir = path.join(root, 'assets/catalogue');
const compactIdMigrationPath = path.join(root, 'supabase/migrations/202608140005_compact_product_ids.sql');
const weddingTerms = [
  'banaras', 'bangle', 'brass', 'dabara', 'kumkum', 'designer tray', 'embossed folk',
  'enamel bangles', 'engraved', 'german silver', 'gomadha', 'hammered copper', 'manjal',
  'mini german', 'ornate', 'peacock', 'pichavari', 'red velvet', 'silver ganesha',
  'small basket', 'small german', 'small jewel', 'small ornate', 'thali', 'blouse material', 'tray'
];
const babyShowerTerms = ['bunny', 'character', 'piggy bank', 'hair band'];
const sqlString = value => `'${String(value).replaceAll("'", "''")}'`;
const legacyProductId = name => `product-${name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
const tagFor = name => {
  const lower = name.toLowerCase();
  if (babyShowerTerms.some(term => lower.includes(term))) return 'baby_shower';
  if (weddingTerms.some(term => lower.includes(term))) return 'wedding';
  return 'all';
};

const files = readdirSync(catalogueDir)
  .filter(file => /\.(png|jpe?g|webp)$/i.test(file))
  .sort((a, b) => a.localeCompare(b));

const products = files.map(file => {
  const ext = path.extname(file);
  const originalStem = path.basename(file, ext).replace(/--(?:product-[a-z0-9-]+|p\d{5})$/, '');
  return { file, ext, name: originalStem.trim(), originalStem };
}).sort((a, b) => a.name.localeCompare(b.name)).map((item, index) => ({
  ...item,
  oldId: legacyProductId(item.name),
  id: `p${String(index + 1).padStart(5, '0')}`,
  tag: tagFor(item.name),
  renamedFile: `${item.originalStem}--p${String(index + 1).padStart(5, '0')}${item.ext}`
}));

const duplicates = products.filter((item, index) => products.findIndex(other => other.id === item.id) !== index);
if (duplicates.length) throw new Error(`Duplicate product IDs: ${duplicates.map(item => item.id).join(', ')}`);

if (process.argv.includes('--write-migration')) throw new Error('The initial seed migration has already been applied and must remain immutable.');
if (process.argv.includes('--write-compact-id-migration')) {
  const mapping = products.map(item => `    (${sqlString(item.oldId)}, ${sqlString(item.id)}, ${sqlString(item.renamedFile)})`).join(',\n');
  const compactIdMigration = `-- Replace verbose generated product IDs with compact, stable catalogue IDs.\nwith mapping(old_id, new_id, new_filename) as (\n  values\n${mapping}\n)\nupdate public.library_items as item\nset id = mapping.new_id,\n    photo = 'assets/catalogue/' || mapping.new_filename\nfrom mapping\nwhere item.id = mapping.old_id\n  and item.kind = 'product';\n`;
  writeFileSync(compactIdMigrationPath, compactIdMigration);
}
if (process.argv.includes('--rename-images')) {
  for (const item of products) {
    const source = path.join(catalogueDir, item.file);
    const target = path.join(catalogueDir, item.renamedFile);
    if (existsSync(target)) throw new Error(`Refusing to overwrite existing image: ${item.renamedFile}`);
    renameSync(source, target);
  }
}

const byTag = products.reduce((counts, product) => ({ ...counts, [product.tag]: (counts[product.tag] || 0) + 1 }), {});
console.log(JSON.stringify({ products: products.length, tags: byTag, migration: path.relative(root, compactIdMigrationPath) }));
