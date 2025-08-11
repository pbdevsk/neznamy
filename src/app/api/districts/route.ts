import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const regionId = searchParams.get('region_id');

    const client = await pool.connect();
    
    try {
      let query = `
        SELECT 
          d.id,
          d.name,
          d.vehicle_registration,
          d.code,
          d.region_id,
          r.name as region_name,
          r.shortcut as region_shortcut,
          COUNT(o.id) as count
        FROM districts d
        JOIN regions r ON d.region_id = r.id
        LEFT JOIN owners o ON d.id = o.district_id
        WHERE d.active = TRUE
      `;

      const values: any[] = [];
      if (regionId) {
        query += ` AND d.region_id = $1`;
        values.push(parseInt(regionId));
      }

      query += `
        GROUP BY d.id, d.name, d.vehicle_registration, d.code, d.region_id, r.name, r.shortcut
        ORDER BY d.name ASC
      `;

      const result = await client.query(query, values);

      const districts = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        vehicle_registration: row.vehicle_registration,
        code: row.code,
        region_id: row.region_id,
        region_name: row.region_name,
        region_shortcut: row.region_shortcut,
        count: parseInt(row.count)
      }));

      return NextResponse.json(districts);

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Districts API error:', error);
    return NextResponse.json(
      { error: 'Chyba pri načítavaní okresov', details: error instanceof Error ? error.message : 'Neznáma chyba' },
      { status: 500 }
    );
  }
}
