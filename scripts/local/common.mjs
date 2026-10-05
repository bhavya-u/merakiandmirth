import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
export const root = resolve(import.meta.dirname, '../..');
export const api = 'http://127.0.0.1:54321';
export const container = 'supabase_db_merakiandmirth-local';
export function status() {
  if (existsSync(resolve(root, 'supabase/.temp/project-ref'))) throw new Error('Refusing to use a linked Supabase project for local testing.');
  const value = JSON.parse(execFileSync(resolve(root, 'node_modules/.bin/supabase'), ['status', '-o', 'json'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' }, stdio: ['ignore', 'pipe', 'pipe']
  }));
  if (value.API_URL !== api) throw new Error('Refusing to use a non-local Supabase instance.');
  return value;
}
export function sql(statement) {
  return execFileSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At'], {
    input: statement, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
  }).trim();
}
export async function request(path, { key, token = key, method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(api + path, {
    method, headers: { apikey: key, Authorization: `Bearer ${token}`, ...headers },
    body, signal: AbortSignal.timeout(20000), redirect: 'error'
  });
  if (!response.ok) throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  if (response.status === 204) return null;
  const text = await response.text();
  try { return JSON.parse(text); } catch { return text; }
}
