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

      // Textové vyhľadávanie
      if (params.q && params.q.trim()) {
        const normalizedQuery = removeDiacritics(params.q.trim());
        
        switch (params.mode) {
          case 'exact':
            const tokens = normalizedQuery.split(/\s+/).filter(t => t.length > 0);
            const tokenConditions = tokens.map(token => {
              values.push(token);
              return `o.meno_clean ~ ('\\m' || $${valueIndex++} || '\\M')`;
            });
            if (tokenConditions.length > 0) {
              conditions.push(`(${tokenConditions.join(' AND ')})`);
            }
            break;
            
          case 'starts':
            values.push(normalizedQuery + '%');
            conditions.push(`o.meno_clean LIKE $${valueIndex++}`);
            break;
            
          case 'contains':
          default:
            values.push(normalizedQuery);
            conditions.push(`o.meno_clean % $${valueIndex++}`);
            break;
        }
      }

      // Filter katastrálne územie
      if (params.kuz && params.kuz !== 'Všetky') {
        values.push(params.kuz);
        conditions.push(`o.katastralne_uzemie = $${valueIndex++}`);
      }

      // Filter LV
      if (params.lv) {
        values.push(params.lv);
        conditions.push(`o.lv = $${valueIndex++}`);
      }

      // Filter región
      if (params.region_id) {
        values.push(params.region_id);
        conditions.push(`o.region_id = $${valueIndex++}`);
      }

      // Filter okres
      if (params.district_id) {
        values.push(params.district_id);
        conditions.push(`o.district_id = $${valueIndex++}`);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Paralelné dotazy pre všetky facety
      const tagWhereClause = whereClause ? `${whereClause} AND` : 'WHERE';
      
      const namesQuery = `
        SELECT t.value, COUNT(*) as count
        FROM owner_tags t
        JOIN owners o ON t.owner_id = o.id
        ${tagWhereClause} t.key = 'meno'
        AND t.value ~ '^[A-ZÁÄČĎÉĚÍĹĽŇÓÔŔŘŠŤÚŮÝŽ]'
        AND LENGTH(t.value) >= 2
        GROUP BY t.value
        ORDER BY count DESC, t.value ASC
        LIMIT 20
      `;
      
      const deathQuery = `
        SELECT t.value, COUNT(*) as count
        FROM owner_tags t
        JOIN owners o ON t.owner_id = o.id
        ${tagWhereClause} t.key = '✝️'
        GROUP BY t.value
        ORDER BY count DESC, t.value ASC
        LIMIT 15
      `;
      
      const territoriesQuery = `
        SELECT o.katastralne_uzemie as value, COUNT(*) as count
        FROM owners o
        ${whereClause}
        GROUP BY o.katastralne_uzemie
        ORDER BY count DESC, value ASC
        LIMIT 10
      `;

      const [namesResult, deathResult, territoriesResult] = await Promise.all([
        client.query(namesQuery, values),
        client.query(deathQuery, values),
        client.query(territoriesQuery, values)
      ]);

      const facets: Facets = {
        given_names: namesResult.rows.map(row => ({
          value: row.value,
          count: parseInt(row.count)
        })),
        maiden_names: deathResult.rows.map(row => ({
          value: row.value,
          count: parseInt(row.count)
        })),
        status: territoriesResult.rows.map(row => ({
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

