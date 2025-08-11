import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const client = await pool.connect();
    
    try {
      // Získanie krajov s počtom záznamov
      const regionsQuery = `
        SELECT 
          r.id,
          r.name,
          r.shortcut,
          COUNT(o.id) as count
        FROM regions r
        LEFT JOIN owners o ON r.id = o.region_id
        WHERE r.active = TRUE
        GROUP BY r.id, r.name, r.shortcut
        ORDER BY r.name ASC
      `;

      const regionsResult = await client.query(regionsQuery);

      const regions = regionsResult.rows.map(row => ({
        id: row.id,
        name: row.name,
        shortcut: row.shortcut,
        count: parseInt(row.count)
      }));

      return NextResponse.json(regions);

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Regions API error:', error);
    return NextResponse.json(
      { error: 'Chyba pri načítavaní krajov', details: error instanceof Error ? error.message : 'Neznáma chyba' },
      { status: 500 }
    );
  }
}
