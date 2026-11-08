// A D1-shaped stand-in over node:sqlite for the Worker's API tests: prepare().bind().all()/run(), batch(); every migration
// in migrations/ applied in order, as D1 applies them.
import { readFileSync, readdirSync } from 'node:fs';
const ROOT = new URL('../../', import.meta.url);
const read = p => readFileSync(new URL(p, ROOT), 'utf8');
export const sqlite = await import('node:sqlite').catch(() => null);
export const skip = sqlite ? false : 'node:sqlite is not available in this Node';
export function d1() {
  const db = new sqlite.DatabaseSync(':memory:');
  for (const m of readdirSync(new URL('migrations/', ROOT)).filter(f => f.endsWith('.sql')).sort()) db.exec(read(`migrations/${m}`));   // as D1 applies them
  const stmt = (sql, args = []) => ({
    bind: (...a) => stmt(sql, a),
    all: async () => ({ results: db.prepare(sql).all(...args) }),
    run: async () => { db.prepare(sql).run(...args); return {}; },
    _go() { return /^\s*select/i.test(sql) ? { results: db.prepare(sql).all(...args) } : (db.prepare(sql).run(...args), { results: [] }); }
  });
  return { prepare: sql => stmt(sql), batch: async list => list.map(s => s._go()), raw: db };
}
