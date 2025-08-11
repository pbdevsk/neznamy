import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

export { pool };

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

