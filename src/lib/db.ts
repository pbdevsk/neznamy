import Database from 'better-sqlite3';
import path from 'path';

// SQLite databáza súbor
const dbPath = path.join(process.cwd(), 'neznamy.sqlite');
const db = new Database(dbPath);

// Optimalizácia pre výkon
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('cache_size = 1000000');
db.pragma('temp_store = MEMORY');

// Inicializácia databázy
initializeDatabase();

function initializeDatabase() {
  // Enable FTS5 extension
  db.exec(`
    -- Create sources table
    CREATE TABLE IF NOT EXISTS sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        imported_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Create owners table  
    CREATE TABLE IF NOT EXISTS owners (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL,
        katastralne_uzemie TEXT NOT NULL,
        poradie INTEGER NOT NULL,
        lv INTEGER NOT NULL,
        meno_raw TEXT NOT NULL,
        meno_clean TEXT NOT NULL,
        gender TEXT DEFAULT 'neisté',
        has_minor_flag BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE CASCADE
    );

    -- Create owner_tags table
    CREATE TABLE IF NOT EXISTS owner_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        owner_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        uncertain BOOLEAN DEFAULT 0,
        FOREIGN KEY (owner_id) REFERENCES owners(id) ON DELETE CASCADE
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_owners_kuz_lv ON owners(katastralne_uzemie, lv);
    CREATE INDEX IF NOT EXISTS idx_owners_meno_clean ON owners(meno_clean);
    CREATE INDEX IF NOT EXISTS idx_owner_tags_key_value ON owner_tags(key, value);
    CREATE INDEX IF NOT EXISTS idx_owners_composite ON owners(katastralne_uzemie, lv, poradie, id);
    
    -- FTS5 virtual table for fulltext search
    CREATE VIRTUAL TABLE IF NOT EXISTS owners_fts USING fts5(
        meno_clean, 
        content='owners', 
        content_rowid='id'
    );
    
    -- Triggers to keep FTS5 in sync
    CREATE TRIGGER IF NOT EXISTS owners_fts_insert AFTER INSERT ON owners BEGIN
        INSERT INTO owners_fts(rowid, meno_clean) VALUES (new.id, new.meno_clean);
    END;
    
    CREATE TRIGGER IF NOT EXISTS owners_fts_delete AFTER DELETE ON owners BEGIN
        INSERT INTO owners_fts(owners_fts, rowid, meno_clean) VALUES('delete', old.id, old.meno_clean);
    END;
    
    CREATE TRIGGER IF NOT EXISTS owners_fts_update AFTER UPDATE ON owners BEGIN
        INSERT INTO owners_fts(owners_fts, rowid, meno_clean) VALUES('delete', old.id, old.meno_clean);
        INSERT INTO owners_fts(rowid, meno_clean) VALUES (new.id, new.meno_clean);
    END;
  `);
}

// Helper functions pre kompatibilitu s PostgreSQL kódom
export const pool = {
  connect: () => Promise.resolve({
    query: (sql: string, params: any[] = []) => {
      try {
        if (sql.trim().toUpperCase().startsWith('SELECT') || sql.trim().toUpperCase().startsWith('WITH')) {
          const stmt = db.prepare(sql);
          const rows = stmt.all(...params);
          return Promise.resolve({ rows });
        } else {
          const stmt = db.prepare(sql);
          const result = stmt.run(...params);
          return Promise.resolve({ 
            rows: result.lastInsertRowid ? [{ id: result.lastInsertRowid }] : [],
            rowCount: result.changes 
          });
        }
      } catch (error) {
        console.error('SQLite query error:', error);
        throw error;
      }
    },
    release: () => Promise.resolve()
  })
};

export { db };

export interface Owner {
  id: number;
  source_id: number;
  katastralne_uzemie: string;
  poradie: number;
  lv: number;
  meno_raw: string;
  meno_clean: string;
  gender: 'muž' | 'žena' | 'neisté';
  has_minor_flag: boolean;
  created_at: Date;
}

export interface OwnerTag {
  id: number;
  owner_id: number;
  key: 'token' | 'rodné' | 'manžel/ka' | 'status' | 'pohlavie' | 'pozn.';
  value: string;
  uncertain: boolean;
}

export interface Source {
  id: number;
  name: string;
  imported_at: Date;
}

export interface SearchResult {
  id: number;
  katastralne_uzemie: string;
  poradie: number;
  lv: number;
  meno_raw: string;
  tags: OwnerTag[];
}

export interface FacetItem {
  value: string;
  count: number;
}

export interface Facets {
  given_names: FacetItem[];
  maiden_names: FacetItem[];
  status: FacetItem[];
}

