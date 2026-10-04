import { rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const generatedAssets = resolve(root, 'android', 'app', 'src', 'main', 'assets', 'public');

await rm(generatedAssets, { recursive: true, force: true });
console.log('Cleared previous generated Android web assets.');
