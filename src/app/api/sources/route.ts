import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import type { Source } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const client = await pool.connect();
    
    try {
      const query = `
        SELECT 
          s.id,
          s.name,
          s.imported_at,
          COUNT(o.id) as record_count
        FROM sources s
        LEFT JOIN owners o ON s.id = o.source_id
        GROUP BY s.id, s.name, s.imported_at
        ORDER BY s.imported_at DESC
      `;

      const result = await client.query(query);
      
      const sources = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        imported_at: row.imported_at,
        record_count: parseInt(row.record_count)
      }));

      return NextResponse.json(sources);

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Sources error:', error);
    return NextResponse.json(
      { error: 'Chyba pri načítavaní zdrojov', details: error instanceof Error ? error.message : 'Neznáma chyba' },
      { status: 500 }
    );
  }
}

