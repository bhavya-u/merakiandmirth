import { access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { root } from './common.mjs';
try {
  await access(`${root}/supabase/.temp/project-ref`);
  throw new Error('Refusing local startup: this folder is linked to a hosted Supabase project. Preserve and move supabase/.temp before continuing.');
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const result = spawnSync(`${root}/node_modules/.bin/supabase`, ['start'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' }
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
