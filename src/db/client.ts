import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const SCHEMA = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS obra (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  nombre TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS partidas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clave TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conceptos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partida_id INTEGER NOT NULL REFERENCES partidas(id) ON DELETE CASCADE,
  clave TEXT NOT NULL,
  descripcion TEXT NOT NULL,
  um TEXT NOT NULL,
  cantidad REAL NOT NULL,
  pu REAL NOT NULL,
  importe REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS gastos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partida_id INTEGER NOT NULL REFERENCES partidas(id) ON DELETE RESTRICT,
  monto REAL NOT NULL,
  descripcion TEXT NOT NULL,
  ruta_comprobante TEXT,
  fecha TEXT NOT NULL,
  ocr_raw TEXT
);

CREATE TABLE IF NOT EXISTS documentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ruta TEXT NOT NULL,
  fecha_subida TEXT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('legal', 'memoria', 'plano')),
  nombre TEXT NOT NULL,
  metadata TEXT,
  rag_status TEXT NOT NULL DEFAULT 'pendiente'
);

CREATE TABLE IF NOT EXISTS meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
`;

export function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('obra.db');
      await db.execAsync(SCHEMA);
      return db;
    })();
  }
  return dbPromise;
}
