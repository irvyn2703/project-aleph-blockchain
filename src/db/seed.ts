import { getDb } from './client';

const RESET_KEY = 'cleared_seed_barrio_norte_v1';

/** One-shot wipe of the hackathon demo seed so the user can load their own files. */
export async function clearDemoDataOnce(): Promise<void> {
  const db = await getDb();
  const flag = await db.getFirstAsync<{ v: string }>('SELECT v FROM meta WHERE k = ?', RESET_KEY);
  if (flag?.v === '1') return;

  await db.execAsync(`
    PRAGMA foreign_keys = OFF;
    DELETE FROM gastos;
    DELETE FROM conceptos;
    DELETE FROM partidas;
    DELETE FROM documentos;
    DELETE FROM obra;
    PRAGMA foreign_keys = ON;
  `);
  await db.runAsync('INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)', RESET_KEY, '1');
}
