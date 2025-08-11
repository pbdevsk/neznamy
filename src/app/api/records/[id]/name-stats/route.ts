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
      // Najprv získame údaje o aktuálnom zázname
      const currentRecordResult = await client.query(`
        SELECT meno_raw, katastralne_uzemie
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
      
      // Extrahovať mená a priezviská z tagov tohto záznamu
      const tagsResult = await client.query(`
        SELECT key, value 
        FROM owner_tags 
        WHERE owner_id = $1 AND key IN ('krstné_meno', 'priezvisko', 'meno')
      `, [recordId]);
      
      const tags = tagsResult.rows;
      const firstNames = tags.filter(t => t.key === 'krstné_meno').map(t => t.value);
      const surnames = tags.filter(t => t.key === 'priezvisko').map(t => t.value);
      const allNames = tags.filter(t => t.key === 'meno').map(t => t.value);
      
      // Štatistiky pre krstné mená
      const firstNameStats = [];
      for (const firstName of firstNames) {
        if (!firstName || firstName.trim().length === 0) continue;
        
        const countResult = await client.query(`
          SELECT COUNT(DISTINCT o.id) as count
          FROM owners o
          JOIN owner_tags ot ON o.id = ot.owner_id
          WHERE ot.key = 'krstné_meno' AND ot.value = $1
        `, [firstName]);
        
        firstNameStats.push({
          name: firstName,
          count: parseInt(countResult.rows[0].count)
        });
      }
      
      // Štatistiky pre priezviská
      const surnameStats = [];
      const topLocationsBySurname = [];
      
      for (const surname of surnames) {
        if (!surname || surname.trim().length === 0) continue;
        
        // Počet ľudí s týmto priezviskom
        const countResult = await client.query(`
          SELECT COUNT(DISTINCT o.id) as count
          FROM owners o
          JOIN owner_tags ot ON o.id = ot.owner_id
          WHERE ot.key = 'priezvisko' AND ot.value = $1
        `, [surname]);
        
        surnameStats.push({
          name: surname,
          count: parseInt(countResult.rows[0].count)
        });
        
        // Top 5 lokalít s týmto priezviskom
        const locationsResult = await client.query(`
          SELECT o.katastralne_uzemie, COUNT(*) as count
          FROM owners o
          JOIN owner_tags ot ON o.id = ot.owner_id
          WHERE ot.key = 'priezvisko' AND ot.value = $1
          GROUP BY o.katastralne_uzemie
          ORDER BY count DESC
          LIMIT 5
        `, [surname]);
        
        topLocationsBySurname.push({
          surname: surname,
          locations: locationsResult.rows.map(row => ({
            location: row.katastralne_uzemie,
            count: parseInt(row.count)
          }))
        });
      }
      
      // Štatistiky pre všetky mená (tokens)
      const allNameStats = [];
      for (const name of allNames) {
        if (!name || name.trim().length === 0) continue;
        
        const countResult = await client.query(`
          SELECT COUNT(DISTINCT o.id) as count
          FROM owners o
          JOIN owner_tags ot ON o.id = ot.owner_id
          WHERE ot.key = 'meno' AND ot.value = $1
        `, [name]);
        
        allNameStats.push({
          name: name,
          count: parseInt(countResult.rows[0].count)
        });
      }
      
      // Ďalšie zaujímavé štatistiky
      
      // Rodinné vzťahy v rámci priezviska
      const familyRelationsStats = [];
      for (const surname of surnames) {
        if (!surname || surname.trim().length === 0) continue;
        
        const relationsResult = await client.query(`
          SELECT ot.key, ot.value, COUNT(*) as count
          FROM owners o
          JOIN owner_tags ot_surname ON o.id = ot_surname.owner_id
          JOIN owner_tags ot ON o.id = ot.owner_id
          WHERE ot_surname.key = 'priezvisko' AND ot_surname.value = $1
          AND ot.key IN ('manžel', 'manželka', 'syn', 'dcéra', 'otec', 'matka', 'brat', 'sestra')
          GROUP BY ot.key, ot.value
          ORDER BY count DESC
          LIMIT 10
        `, [surname]);
        
        if (relationsResult.rows.length > 0) {
          familyRelationsStats.push({
            surname: surname,
            relations: relationsResult.rows.map(row => ({
              type: row.key,
              name: row.value,
              count: parseInt(row.count)
            }))
          });
        }
      }
      
      // Rodné priezviská
      const maidenNamesStats = [];
      const maidenNamesResult = await client.query(`
        SELECT ot.value, COUNT(*) as count
        FROM owners o
        JOIN owner_tags ot_surname ON o.id = ot_surname.owner_id
        JOIN owner_tags ot ON o.id = ot.owner_id
        WHERE ot_surname.key = 'priezvisko' AND ot_surname.value = ANY($1)
        AND ot.key = 'rodné_priezvisko'
        GROUP BY ot.value
        ORDER BY count DESC
        LIMIT 10
      `, [surnames]);
      
      maidenNamesStats.push(...maidenNamesResult.rows.map(row => ({
        maidenName: row.value,
        count: parseInt(row.count)
      })));

      const response = {
        currentRecord: {
          id: recordId,
          meno_raw: currentRecord.meno_raw,
          katastralne_uzemie: currentRecord.katastralne_uzemie
        },
        firstNames: firstNameStats,
        surnames: surnameStats,
        allNames: allNameStats,
        topLocationsBySurname,
        familyRelations: familyRelationsStats,
        maidenNames: maidenNamesStats
      };

      return NextResponse.json(response);
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('Chyba pri načítavaní štatistík mien:', error);
    return NextResponse.json(
      { error: 'Chyba pri načítavaní štatistík mien' },
      { status: 500 }
    );
  }
}
