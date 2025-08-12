import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { removeDiacritics } from '@/lib/normalize';
import type { Facets } from '@/lib/db';

interface FacetParams {
  q?: string;
  kuz?: string;
  lv?: number;
  region_id?: number;
  district_id?: number;
  mode?: 'contains' | 'exact' | 'starts';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const params: FacetParams = {
      q: searchParams.get('q') || undefined,
      kuz: searchParams.get('kuz') || undefined,
      lv: searchParams.get('lv') ? parseInt(searchParams.get('lv')!) : undefined,
      region_id: searchParams.get('region_id') ? parseInt(searchParams.get('region_id')!) : undefined,
      district_id: searchParams.get('district_id') ? parseInt(searchParams.get('district_id')!) : undefined,
      mode: (searchParams.get('mode') as FacetParams['mode']) || 'contains'
    };

    const client = await pool.connect();
    
    try {
      // Zostavenie WHERE klauzuly pre filtrovanie (rovnako ako v search)
      const conditions: string[] = [];
      const values: any[] = [];
      let valueIndex = 1;

      // Textové vyhľadávanie pre SQLite
      if (params.q && params.q.trim()) {
        const normalizedQuery = removeDiacritics(params.q.trim());
        
        switch (params.mode) {
          case 'exact':
            conditions.push(`o.id IN (SELECT rowid FROM owners_fts WHERE meno_clean MATCH ?)`);
            values.push(`"${normalizedQuery}"`);
            break;
            
          case 'starts':
            conditions.push(`o.meno_clean LIKE ?`);
            values.push(normalizedQuery + '%');
            break;
            
          case 'contains':
          default:
            conditions.push(`o.id IN (SELECT rowid FROM owners_fts WHERE meno_clean MATCH ?)`);
            values.push(normalizedQuery + '*');
            break;
        }
      }

      // Filter katastrálne územie
      if (params.kuz && params.kuz !== 'Všetky') {
        conditions.push(`o.katastralne_uzemie = ?`);
        values.push(params.kuz);
      }

      // Filter LV
      if (params.lv) {
        conditions.push(`o.lv = ?`);
        values.push(params.lv);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // SQLite facets queries
      const tagWhereClause = whereClause ? `${whereClause} AND` : 'WHERE';
      
      const namesQuery = `
        SELECT t.value, COUNT(*) as count
        FROM owner_tags t
        JOIN owners o ON t.owner_id = o.id
        ${tagWhereClause} t.key = 'token'
        AND LENGTH(t.value) >= 2
        GROUP BY t.value
        ORDER BY count DESC, t.value ASC
        LIMIT 20
      `;
      
      const maidenQuery = `
        SELECT t.value, COUNT(*) as count
        FROM owner_tags t
        JOIN owners o ON t.owner_id = o.id
        ${tagWhereClause} t.key = 'rodné'
        GROUP BY t.value
        ORDER BY count DESC, t.value ASC
        LIMIT 15
      `;
      
      const statusQuery = `
        SELECT t.value, COUNT(*) as count
        FROM owner_tags t
        JOIN owners o ON t.owner_id = o.id
        ${tagWhereClause} t.key = 'status'
        GROUP BY t.value
        ORDER BY count DESC, t.value ASC
        LIMIT 10
      `;

      const [namesResult, maidenResult, statusResult] = await Promise.all([
        client.query(namesQuery, values),
        client.query(maidenQuery, values),
        client.query(statusQuery, values)
      ]);

      const facets: Facets = {
        given_names: namesResult.rows.map(row => ({
          value: row.value,
          count: parseInt(row.count)
        })),
        maiden_names: maidenResult.rows.map(row => ({
          value: row.value,
          count: parseInt(row.count)
        })),
        status: statusResult.rows.map(row => ({
          value: row.value,
          count: parseInt(row.count)
        }))
      };

      return NextResponse.json(facets);

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Facets error:', error);
    return NextResponse.json(
      { error: 'Chyba pri načítavaní facetov', details: error instanceof Error ? error.message : 'Neznáma chyba' },
      { status: 500 }
    );
  }
}

