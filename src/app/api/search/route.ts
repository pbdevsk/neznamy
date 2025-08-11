import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { removeDiacritics } from '@/lib/normalize';
import type { SearchResult, OwnerTag } from '@/lib/db';

interface SearchParams {
  q?: string;
  kuz?: string;
  lv?: number;
  region_id?: number;
  district_id?: number;
  mode?: 'contains' | 'exact' | 'starts';
  limit?: number;
  cursor?: string;
}

interface SearchResponse {
  items: SearchResult[];
  next_cursor?: string;
  total_estimated?: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    
    const params: SearchParams = {
      q: searchParams.get('q') || undefined,
      kuz: searchParams.get('kuz') || undefined,
      lv: searchParams.get('lv') ? parseInt(searchParams.get('lv')!) : undefined,
      region_id: searchParams.get('region_id') ? parseInt(searchParams.get('region_id')!) : undefined,
      district_id: searchParams.get('district_id') ? parseInt(searchParams.get('district_id')!) : undefined,
      mode: (searchParams.get('mode') as SearchParams['mode']) || 'contains',
      limit: Math.min(parseInt(searchParams.get('limit') || '50'), 200),
      cursor: searchParams.get('cursor') || undefined
    };

    const client = await pool.connect();
    
    try {
      // Zostavenie WHERE klauzuly
      const conditions: string[] = [];
      const values: any[] = [];
      let valueIndex = 1;

      // Textové vyhľadávanie
      if (params.q && params.q.trim()) {
        const normalizedQuery = removeDiacritics(params.q.trim());
        
        switch (params.mode) {
          case 'exact':
            // Tokenová presná zhoda
            const tokens = normalizedQuery.split(/\s+/).filter(t => t.length > 0);
            const tokenConditions = tokens.map(token => {
              values.push(token);
              return `meno_clean ~ ('\\m' || $${valueIndex++} || '\\M')`;
            });
            if (tokenConditions.length > 0) {
              conditions.push(`(${tokenConditions.join(' AND ')})`);
            }
            break;
            
          case 'starts':
            values.push(normalizedQuery + '%');
            conditions.push(`meno_clean LIKE $${valueIndex++}`);
            break;
            
          case 'contains':
          default:
            // Trigram similarity search
            values.push(normalizedQuery);
            conditions.push(`meno_clean % $${valueIndex++}`);
            break;
        }
      }

      // Filter katastrálne územie
      if (params.kuz && params.kuz !== 'Všetky') {
        values.push(params.kuz);
        conditions.push(`katastralne_uzemie = $${valueIndex++}`);
      }

      // Filter LV
      if (params.lv) {
        values.push(params.lv);
        conditions.push(`lv = $${valueIndex++}`);
      }

      // Filter región
      if (params.region_id) {
        values.push(params.region_id);
        conditions.push(`region_id = $${valueIndex++}`);
      }

      // Filter okres
      if (params.district_id) {
        values.push(params.district_id);
        conditions.push(`district_id = $${valueIndex++}`);
      }

      // Cursor pagination
      if (params.cursor) {
        try {
          const cursorData = JSON.parse(Buffer.from(params.cursor, 'base64').toString());
          values.push(cursorData.id);
          conditions.push(`id > $${valueIndex++}`);
        } catch (e) {
          // Neplatný cursor, ignorujeme
        }
      }

      // Zostavenie ORDER BY
      let orderBy = 'id ASC'; // Default ordering
      if (params.q && params.mode === 'contains') {
        orderBy = `similarity(meno_clean, $1) DESC, katastralne_uzemie ASC, lv ASC, poradie ASC, id ASC`;
      } else if (params.q) {
        orderBy = 'katastralne_uzemie ASC, lv ASC, poradie ASC, id ASC';
      } else {
        orderBy = 'katastralne_uzemie ASC, lv ASC, poradie ASC, id ASC';
      }

      // Hlavný dotaz
      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      
      const query = `
        SELECT 
          id,
          katastralne_uzemie,
          poradie,
          lv,
          meno_raw
        FROM owners
        ${whereClause}
        ORDER BY ${orderBy}
        LIMIT $${valueIndex}
      `;

      values.push(params.limit! + 1); // +1 pre zistenie, či existuje ďalšia strana

      const result = await client.query(query, values);
      const owners = result.rows;

      // Zistenie, či existuje ďalšia strana
      const hasNext = owners.length > params.limit!;
      if (hasNext) {
        owners.pop(); // Odstránenie extra riadku
      }

      // Načítanie tagov pre nájdených vlastníkov
      const ownerIds = owners.map(owner => owner.id);
      let tags: OwnerTag[] = [];

      if (ownerIds.length > 0) {
        const tagsQuery = `
          SELECT owner_id, key, value, uncertain
          FROM owner_tags
          WHERE owner_id = ANY($1)
          ORDER BY owner_id, 
            CASE key
              WHEN 'meno' THEN 1
              WHEN '✝️' THEN 2
              ELSE 3
            END
        `;
        
        const tagsResult = await client.query(tagsQuery, [ownerIds]);
        tags = tagsResult.rows;
      }

      // Zostavenie výsledkov
      const items: SearchResult[] = owners.map(owner => ({
        id: owner.id,
        katastralne_uzemie: owner.katastralne_uzemie,
        poradie: owner.poradie,
        lv: owner.lv,
        meno_raw: owner.meno_raw,
        tags: tags.filter(tag => tag.owner_id === owner.id)
      }));

      // Vytvorenie next_cursor
      let next_cursor: string | undefined;
      if (hasNext && items.length > 0) {
        const lastItem = items[items.length - 1];
        const cursorData = { id: lastItem.id };
        next_cursor = Buffer.from(JSON.stringify(cursorData)).toString('base64');
      }

      const response: SearchResponse = {
        items,
        next_cursor
      };

      return NextResponse.json(response);

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'Chyba pri vyhľadávaní', details: error instanceof Error ? error.message : 'Neznáma chyba' },
      { status: 500 }
    );
  }
}

