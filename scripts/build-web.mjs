import { cp, mkdir, rm } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, process.env.WEB_BUILD_OUTPUT || 'dist');
if (output !== resolve(root, 'dist') && !output.startsWith(resolve(root, '.local') + sep)) throw new Error('Build output must be dist or a private .local directory');
const files = [
  'index.html',
  'app.js',
  'product-images.js',
  'expense-export.js', 'product-catalogue.js',
  'styles.css',
  'supabase-config.js',
  'manifest.webmanifest'
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await mkdir(resolve(output, 'vendor'), { recursive: true });
await Promise.all([
  ...files.map(file => cp(resolve(root, file), resolve(output, file))),
  cp(resolve(root, 'node_modules/exceljs/dist/exceljs.min.js'), resolve(output, 'vendor/exceljs.min.js')),
  cp(resolve(root, 'node_modules/jspdf/dist/jspdf.umd.min.js'), resolve(output, 'vendor/jspdf.umd.min.js')),
  cp(resolve(root, 'assets'), resolve(output, 'assets'), {
    recursive: true,
    filter: source => relative(resolve(root, 'assets', 'catalogue'), source).startsWith('..')
  })
]);

console.log('Built static web bundle in dist/.');
