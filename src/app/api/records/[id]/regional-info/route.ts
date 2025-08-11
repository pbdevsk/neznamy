import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const recordId = parseInt(params.id);
    
    if (isNaN(recordId)) {
      return NextResponse.json(
        { error: 'Neplatné ID záznamu' },
        { status: 400 }
      );
    }

    const client = await pool.connect();
    
    try {
      // Získanie regionálnych údajov pre záznam
      const query = `
        SELECT 
          o.id,
          o.katastralne_uzemie,
          o.poradie,
          o.lv,
          o.meno_raw,
          r.name as region_name,
          r.shortcut as region_shortcut,
          d.name as district_name,
          d.vehicle_registration as district_vehicle_registration,
          v.fullname as village_name,
          v.shortname as village_shortname,
          v.zip as village_zip
        FROM owners o
        LEFT JOIN regions r ON o.region_id = r.id
        LEFT JOIN districts d ON o.district_id = d.id
        LEFT JOIN cadastral_to_village_mapping m ON o.katastralne_uzemie = m.cadastral_territory
        LEFT JOIN villages v ON m.village_id = v.id
        WHERE o.id = $1
      `;

      const result = await client.query(query, [recordId]);

      if (result.rows.length === 0) {
        return NextResponse.json(
          { error: 'Záznam nenájdený' },
          { status: 404 }
        );
      }

      const record = result.rows[0];

      const regionalInfo = {
        region_name: record.region_name || 'Neznámy',
        region_shortcut: record.region_shortcut || '??',
        district_name: record.district_name || 'Neznámy',
        district_vehicle_registration: record.district_vehicle_registration || '??',
        village_name: record.village_name,
        village_shortname: record.village_shortname,
        village_zip: record.village_zip
      };

      return NextResponse.json(regionalInfo);

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Regional info API error:', error);
    return NextResponse.json(
      { error: 'Chyba pri načítavaní regionálnych údajov', details: error instanceof Error ? error.message : 'Neznáma chyba' },
      { status: 500 }
    );
  }
}
