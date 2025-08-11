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
      // Najprv získame LV a katastrálne územie pre daný záznam
      const currentRecordResult = await client.query(`
        SELECT lv, katastralne_uzemie, poradie, meno_raw
        FROM owners 
        WHERE id = $1
      `, [recordId]);

      if (currentRecordResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'Záznam nenájdený' },
          { status: 404 }
        );
      }

      const currentRecord = currentRecordResult.rows[0];
      
      // Získame všetkých ostatných ľudí na tom istom LV (okrem aktuálneho záznamu)
      const relationsResult = await client.query(`
        SELECT 
          o.id,
          o.meno_raw,
          o.poradie,
          COALESCE(
            json_agg(
              json_build_object(
                'key', ot.key,
                'value', ot.value,
                'uncertain', ot.uncertain
              ) ORDER BY 
                CASE ot.key 
                  WHEN 'meno' THEN 1 
                  WHEN '✝️' THEN 2 
                  ELSE 3 
                END, ot.value
            ) FILTER (WHERE ot.key IS NOT NULL),
            '[]'::json
          ) as tags
        FROM owners o
        LEFT JOIN owner_tags ot ON o.id = ot.owner_id
        WHERE o.lv = $1 
          AND o.katastralne_uzemie = $2 
          AND o.id != $3
        GROUP BY o.id, o.meno_raw, o.poradie
        ORDER BY o.poradie, o.meno_raw
      `, [currentRecord.lv, currentRecord.katastralne_uzemie, recordId]);

      const relations = relationsResult.rows;

      return NextResponse.json({
        currentRecord: {
          id: recordId,
          meno_raw: currentRecord.meno_raw,
          lv: currentRecord.lv,
          katastralne_uzemie: currentRecord.katastralne_uzemie,
          poradie: currentRecord.poradie
        },
        relations: relations,
        totalCount: relations.length
      });

    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Chyba pri načítaní vzťahov na LV:', error);
    return NextResponse.json(
      { 
        error: 'Chyba pri načítaní vzťahov', 
        details: error instanceof Error ? error.message : 'Neznáma chyba' 
      },
      { status: 500 }
    );
  }
}
