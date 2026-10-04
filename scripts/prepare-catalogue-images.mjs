import { mkdir, readdir, stat } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { basename, extname, resolve } from 'node:path';

const run = promisify(execFile);
const root = resolve(import.meta.dirname, '..');
const sourceDir = resolve(root, 'assets', 'catalogue');
const outputDir = resolve(root, 'assets', 'catalogue-webp');
const entries = (await readdir(sourceDir, { withFileTypes: true }))
  .filter(entry => entry.isFile() && /\.png$/i.test(entry.name))
  .map(entry => entry.name);

await mkdir(outputDir, { recursive: true });
let converted = 0;
for (const name of entries) {
  const source = resolve(sourceDir, name);
  const output = resolve(outputDir, `${basename(name, extname(name))}.webp`);
  const [sourceInfo, outputInfo] = await Promise.all([stat(source), stat(output).catch(() => null)]);
  if (outputInfo && outputInfo.mtimeMs >= sourceInfo.mtimeMs) continue;
  await run('cwebp', ['-quiet', '-q', '82', source, '-o', output]);
  converted += 1;
}

console.log(`Catalogue images ready: ${entries.length - converted} reused, ${converted} converted.`);
