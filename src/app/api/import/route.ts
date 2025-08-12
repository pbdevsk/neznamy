import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { normalizeText, hasMinorFlag, detectGender, generateTags } from '@/lib/normalize';
import { debugLog, debugError, debugAPI } from '@/lib/debug';
import { AdvancedParser } from '@/lib/parser/advanced-parser';
import { ImportUtils } from '@/lib/parser/import-utils';
import Papa from 'papaparse';

interface CSVRow {
  [key: string]: string;
}

interface ImportStats {
  sourceId: number;
  totalRows: number;
  successfulRows: number;
  errors: string[];
  duration: number;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  debugAPI('POST', '/api/import', 'Starting CSV import');
  
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    let delimiter = (formData.get('delimiter') as string) || ',';
    // Fix for delimiter parsing  
    if (delimiter === '' || delimiter === null || delimiter === undefined) {
      delimiter = ';'; // default to semicolon
    }
    const columnMappingString = formData.get('columnMapping') as string;
    
    debugLog('Import params', {
      fileName: file?.name,
      fileSize: file?.size,
      delimiter,
      columnMappingString
    });
    
    if (!file) {
      debugError('Import validation', 'No file provided');
      return NextResponse.json(
        { error: 'Súbor nie je priložený' },
        { status: 400 }
      );
    }

    if (!columnMappingString) {
      debugError('Import validation', 'No column mapping provided');
      return NextResponse.json(
        { error: 'Mapovanie stĺpcov nie je definované' },
        { status: 400 }
      );
    }

    let columnMapping: any;
    try {
      columnMapping = JSON.parse(columnMappingString);
      debugLog('Column mapping parsed', columnMapping);
    } catch (e) {
      debugError('Column mapping parse', e);
      return NextResponse.json(
        { error: 'Neplatné mapovanie stĺpcov' },
        { status: 400 }
      );
    }

    // Načítanie a parsovanie CSV
    const text = await file.text();
    debugLog('File content preview', text.substring(0, 500));
    
    const parseResult = Papa.parse<CSVRow>(text, {
      header: true,
      delimiter,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim(),
      // Povoliť extra stĺpce - ignorovať TooManyFields chyby
      skipErrors: true
    });

    debugLog('CSV parse result', {
      dataRows: parseResult.data.length,
      errorsCount: parseResult.errors.length,
      errorTypes: parseResult.errors.slice(0, 5).map(e => e.type),
      meta: parseResult.meta
    });

    // Filtrovať iba kritické chyby (nie TooManyFields)
    const criticalErrors = parseResult.errors.filter(error => 
      error.type !== 'FieldMismatch' || error.code !== 'TooManyFields'
    );

    if (criticalErrors.length > 0) {
      debugError('Critical CSV parsing errors', criticalErrors);
      return NextResponse.json(
        { error: 'Chyba pri parsovaní CSV', details: criticalErrors },
        { status: 400 }
      );
    }

    const rows = parseResult.data;
    const stats: ImportStats = {
      sourceId: 0,
      totalRows: rows.length,
      successfulRows: 0,
      errors: [],
      duration: 0
    };

    // Validácia mapovaných stĺpcov
    const requiredMappings = ['katastralne_uzemie', 'poradie', 'lv', 'meno'];
    const missingMappings = requiredMappings.filter(field => !columnMapping[field]);
    
    if (missingMappings.length > 0) {
      return NextResponse.json(
        { error: 'Chýbajúce mapovanie stĺpcov', missing: missingMappings },
        { status: 400 }
      );
    }

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Vytvorenie source záznamu
      const sourceResult = await client.query(
        'INSERT INTO sources (name) VALUES ($1) RETURNING id',
        [file.name]
      );
      stats.sourceId = sourceResult.rows[0].id;

      // Príprava batch insertu s progress reportingom (iba owners najprv)
      const ownerInserts: any[] = [];
      const BATCH_SIZE = 1000; // Process in batches of 1000

      debugLog('Processing rows', { totalRows: rows.length, batchSize: BATCH_SIZE });

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        
        try {
          const katastralne_uzemie = row[columnMapping.katastralne_uzemie]?.trim();
          const poradie = parseInt(row[columnMapping.poradie]?.trim() || '0');
          const lv = parseInt(row[columnMapping.lv]?.trim() || '0');
          const meno_raw = row[columnMapping.meno]?.trim();

          if (!katastralne_uzemie || !meno_raw || isNaN(poradie) || isNaN(lv) || poradie < 0 || lv < 0) {
            stats.errors.push(`Riadok ${i + 2}: Neplatné alebo chýbajúce povinné údaje`);
            continue;
          }

          const meno_clean = normalizeText(meno_raw);
          const { gender } = detectGender(meno_raw);
          const has_minor_flag = hasMinorFlag(meno_raw);

          ownerInserts.push([
            stats.sourceId,
            katastralne_uzemie,
            poradie,
            lv,
            meno_raw,
            meno_clean,
            gender,
            has_minor_flag
          ]);

          stats.successfulRows++;
        } catch (error) {
          stats.errors.push(`Riadok ${i + 2}: ${error instanceof Error ? error.message : 'Neznáma chyba'}`);
        }

        // Progress reporting every 10000 rows
        if ((i + 1) % 10000 === 0) {
          debugLog('Progress', { processed: i + 1, total: rows.length, percentage: Math.round(((i + 1) / rows.length) * 100) });
        }
      }

      debugLog('Data preparation complete', { 
        ownerInserts: ownerInserts.length, 
        errors: stats.errors.length 
      });

      // Batch insert owners s rozdelením na menšie batche
      const ownerIds: number[] = [];
      
      if (ownerInserts.length > 0) {
        const OWNER_BATCH_SIZE = 5000; // 5000 rows at a time
        debugLog('Starting owner batch inserts', { 
          totalOwners: ownerInserts.length, 
          batchSize: OWNER_BATCH_SIZE,
          batches: Math.ceil(ownerInserts.length / OWNER_BATCH_SIZE)
        });

        for (let i = 0; i < ownerInserts.length; i += OWNER_BATCH_SIZE) {
          const batch = ownerInserts.slice(i, i + OWNER_BATCH_SIZE);
          
          const ownerValues = batch.map((_, index) => 
            `($${index * 8 + 1}, $${index * 8 + 2}, $${index * 8 + 3}, $${index * 8 + 4}, $${index * 8 + 5}, $${index * 8 + 6}, $${index * 8 + 7}, $${index * 8 + 8})`
          ).join(', ');

          const ownerParams = batch.flat();
          const ownerQuery = `
            INSERT INTO owners (source_id, katastralne_uzemie, poradie, lv, meno_raw, meno_clean, gender, has_minor_flag)
            VALUES ${ownerValues}
            RETURNING id
          `;

          debugLog('Owner batch insert', { 
            batchNumber: Math.floor(i / OWNER_BATCH_SIZE) + 1,
            batchSize: batch.length,
            paramCount: ownerParams.length
          });

          const ownerResult = await client.query(ownerQuery, ownerParams);
          const batchIds = ownerResult.rows.map(row => row.id);
          ownerIds.push(...batchIds);

          debugLog('Owner batch completed', { 
            insertedIds: batchIds.length,
            totalSoFar: ownerIds.length
          });
        }

        // Generovanie tagov pre vložených vlastníkov pomocou nového tag engine
        debugLog('Starting tag generation using new tag engine', { 
          ownerCount: ownerIds.length 
        });

        // Načítaj všetkých vlastníkov s ich meno_raw
        const ownersForTags = await client.query(`
          SELECT id, meno_raw FROM owners 
          WHERE id = ANY($1::int[])
          ORDER BY id
        `, [ownerIds]);

        let totalTagsGenerated = 0;
        const TAG_BATCH_SIZE = 10000;

        // Spracuj vlastníkov v batchoch pre tagy
        for (let i = 0; i < ownersForTags.rows.length; i += 1000) {
          const ownerBatch = ownersForTags.rows.slice(i, i + 1000);
          const tagInserts: any[] = [];

          // Generuj tagy pre každého vlastníka v batchi
          for (const owner of ownerBatch) {
            const tags = await generateTags(owner.meno_raw);
            
            for (const tag of tags) {
              tagInserts.push([owner.id, tag.key, tag.value, tag.uncertain]);
            }
          }

          // Batch insert tagov
          if (tagInserts.length > 0) {
            for (let j = 0; j < tagInserts.length; j += TAG_BATCH_SIZE) {
              const batch = tagInserts.slice(j, j + TAG_BATCH_SIZE);
              
              const tagValues = batch.map((_, index) => 
                `($${index * 4 + 1}, $${index * 4 + 2}, $${index * 4 + 3}, $${index * 4 + 4})`
              ).join(', ');

              const tagParams = batch.flat();
              const tagQuery = `
                INSERT INTO owner_tags (owner_id, key, value, uncertain)
                VALUES ${tagValues}
              `;

              await client.query(tagQuery, tagParams);
              totalTagsGenerated += batch.length;

              debugLog('Tag batch completed', { 
                processed: totalTagsGenerated,
                currentBatch: batch.length
              });
            }
          }

          debugLog('Owner batch tags completed', { 
            ownerBatch: `${i + 1}-${Math.min(i + 1000, ownersForTags.rows.length)}`,
            totalOwners: ownersForTags.rows.length,
            tagsGenerated: totalTagsGenerated
          });
        }

        debugLog('Tag generation complete', { 
          totalOwners: ownerIds.length,
          totalTagsGenerated: totalTagsGenerated
        });
      }

      await client.query('COMMIT');
      stats.duration = Date.now() - startTime;

      return NextResponse.json(stats);

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: 'Chyba pri importe', details: error instanceof Error ? error.message : 'Neznáma chyba' },
      { status: 500 }
    );
  }
}

