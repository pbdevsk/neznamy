-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create sources table
CREATE TABLE IF NOT EXISTS sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    imported_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create owners table  
CREATE TABLE IF NOT EXISTS owners (
    id SERIAL PRIMARY KEY,
    source_id INTEGER NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    katastralne_uzemie VARCHAR(255) NOT NULL,
    poradie INTEGER NOT NULL,
    lv INTEGER NOT NULL,
    meno_raw TEXT NOT NULL,
    meno_clean TEXT NOT NULL,
    tsv TSVECTOR,
    gender VARCHAR(20) DEFAULT 'neisté',
    has_minor_flag BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create owner_tags table
CREATE TABLE IF NOT EXISTS owner_tags (
    id SERIAL PRIMARY KEY,
    owner_id INTEGER NOT NULL REFERENCES owners(id) ON DELETE CASCADE,
    key VARCHAR(50) NOT NULL,
    value TEXT NOT NULL,
    uncertain BOOLEAN DEFAULT FALSE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_owners_kuz_lv ON owners(katastralne_uzemie, lv);
CREATE INDEX IF NOT EXISTS idx_owners_meno_clean_trgm ON owners USING gin(meno_clean gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_owners_tsv ON owners USING gin(tsv);
CREATE INDEX IF NOT EXISTS idx_owner_tags_key_value ON owner_tags(key, value);
CREATE INDEX IF NOT EXISTS idx_owner_tags_value_trgm ON owner_tags USING gin(value gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_owners_composite ON owners(katastralne_uzemie, lv, poradie, id);

-- Create function to update tsvector
CREATE OR REPLACE FUNCTION update_owners_tsv() RETURNS TRIGGER AS $$
BEGIN
    NEW.tsv := to_tsvector('simple', NEW.meno_clean);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update tsvector
DROP TRIGGER IF EXISTS trig_update_owners_tsv ON owners;
CREATE TRIGGER trig_update_owners_tsv
    BEFORE INSERT OR UPDATE ON owners
    FOR EACH ROW EXECUTE FUNCTION update_owners_tsv();

