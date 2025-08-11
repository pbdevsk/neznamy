import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { generateTags } from '@/lib/normalize';

export async function POST(request: NextRequest) {
  try {
    const client = await pool.connect();
    
    try {
      console.log('🚀 Začínam pretagovanie všetkých záznamov...');
      
      // 1. Vymazanie starých tagov (okrem manuálnych)
      await client.query('DELETE FROM owner_tags WHERE id NOT IN (SELECT id FROM manual_tags)');
      console.log('✅ Staré automatické tagy vymazané');
      
      // 2. Načítanie všetkých vlastníkov
      const ownersResult = await client.query(
        'SELECT id, meno_raw FROM owners ORDER BY id'
      );
      
      const owners = ownersResult.rows;
      console.log(`📊 Našiel som ${owners.length} vlastníkov na spracovanie`);
      
      let processedCount = 0;
      let newTagsCount = 0;
      const batchSize = 1000;
      
      // 3. Spracovanie v dávkách
      for (let i = 0; i < owners.length; i += batchSize) {
        const batch = owners.slice(i, i + batchSize);
        
        // Generovanie tagov pre dávku
        const tagsToInsert: Array<{owner_id: number, key: string, value: string, uncertain: boolean}> = [];
        
        batch.forEach(owner => {
          const generatedTags = generateTags(owner.meno_raw);
          generatedTags.forEach(tag => {
            tagsToInsert.push({
              owner_id: owner.id,
              key: tag.key,
              value: tag.value,
              uncertain: tag.uncertain || false
            });
          });
        });
        
        // Batch insert tagov
        if (tagsToInsert.length > 0) {
          const values: string[] = [];
          const params: any[] = [];
          let paramIndex = 1;
          
          tagsToInsert.forEach(tag => {
            values.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3})`);
            params.push(tag.owner_id, tag.key, tag.value, tag.uncertain);
            paramIndex += 4;
          });
          
          const insertQuery = `
            INSERT INTO owner_tags (owner_id, key, value, uncertain)
            VALUES ${values.join(', ')}
          `;
          
          await client.query(insertQuery, params);
          newTagsCount += tagsToInsert.length;
        }
        
        processedCount += batch.length;
        
        // Progress log každých 5000 záznamov
        if (processedCount % 5000 === 0 || processedCount === owners.length) {
          console.log(`📈 Spracovaných: ${processedCount}/${owners.length} (${Math.round(processedCount/owners.length*100)}%)`);
        }
      }
      
      console.log(`🎉 Pretagovanie dokončené!`);
      console.log(`📊 Spracovaných vlastníkov: ${processedCount}`);
      console.log(`🏷️ Vytvorených tagov: ${newTagsCount}`);
      
      return NextResponse.json({
        success: true,
        message: 'Pretagovanie úspešne dokončené',
        stats: {
          processedOwners: processedCount,
          newTags: newTagsCount
        }
      });
      
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('❌ Chyba pri pretagovaní:', error);
    return NextResponse.json(
      { 
        error: 'Chyba pri pretagovaní', 
        details: error instanceof Error ? error.message : 'Neznáma chyba' 
      },
      { status: 500 }
    );
  }
}
