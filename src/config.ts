import { readFileSync } from 'node:fs';
export type Config = { enabled: boolean; device: string; mode: 'keys'|'clipboard'; paste: 'ctrl-v'|'ctrl-shift-v'; idleMs: number; matches: Record<string,string> };
export function validate(value: unknown): Config {
  const c = value as Config;
  if (!c || typeof c !== 'object' || typeof c.enabled !== 'boolean' ||
      typeof c.device !== 'string' || !/^\/dev\/input\/by-id\/[\w.-]+-event-kbd$/.test(c.device) ||
      !['keys','clipboard'].includes(c.mode) || !['ctrl-v','ctrl-shift-v'].includes(c.paste) ||
      !Number.isInteger(c.idleMs) || c.idleMs < 100 || c.idleMs > 10000 ||
      !c.matches || typeof c.matches !== 'object' || Array.isArray(c.matches)) throw new Error('Invalid configuration');
  const entries = Object.entries(c.matches);
  if (entries.length > 500) throw new Error('Too many matches');
  for (const [key,text] of entries) {
    if (!/^:[a-z][a-z0-9_]{0,63}$/.test(key) || typeof text !== 'string' || text.length > 512 || text.includes('\0')) throw new Error('Invalid match');
    if (c.mode === 'keys' && !/^[\x20-\x7e]*$/.test(text)) throw new Error('keys mode requires printable ASCII; use clipboard for Unicode');
  }
  const keys = entries.map(([key])=>key);
  if (keys.some(a=>keys.some(b=>a!==b && b.startsWith(a)))) throw new Error('Instant triggers must not be prefixes of other triggers');
  return c;
}
export function readConfig(path: string): Config { return validate(JSON.parse(readFileSync(path,'utf8'))); }
