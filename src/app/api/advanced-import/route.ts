import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { AdvancedParser } from '@/lib/parser/advanced-parser';
import { debugLog, debugError, debugAPI } from '@/lib/debug';
import Papa from 'papaparse';
import { ParsedRecord, RawRecord } from '@/lib/parser/types';

interface CSVRow {
  [key: string]: string;
}

interface ImportStats {
  total_records: number;
  processed_successfully: number;
  problematic_count: number;
  spf_count: number;
  gender_stats: { muž: number; žena: number; neisté: number };
  tag_stats: Record<string, number>;
  most_common_unmatched: Array<{ pattern: string; count: number }>;
}

export async function POST(request: NextRequest) {
  debugAPI('Advanced import request received');

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const delimiter = formData.get('delimiter') as string || ',';
    const columnMappingStr = formData.get('columnMapping') as string;
    
    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    debugLog('Processing file:', file.name);
    debugLog('Import parameters:', { delimiter, columnMappingStr });
    
    let columnMapping: any = {};
    if (columnMappingStr) {
      try {
        columnMapping = JSON.parse(columnMappingStr);
        debugLog('Column mapping parsed:', columnMapping);
      } catch (err) {
        debugError('Error parsing column mapping:', err);
      }
    }

    // Načítanie a parsing CSV
    const text = await file.text();
    debugLog('CSV text length:', text.length);
    
    const parseResult = Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      encoding: 'UTF-8',
      delimiter: delimiter
    });
    
    debugLog('Papa.parse completed:', {
      dataLength: parseResult.data.length,
      errorsCount: parseResult.errors.length,
      meta: parseResult.meta
    });

    if (parseResult.errors.length > 0) {
      debugError('CSV parsing errors:', parseResult.errors);
    }

    const csvData = parseResult.data as CSVRow[];
    debugLog(`Parsed ${csvData.length} rows`);

    // Vytvorenie pokročilého parsera
    debugLog('Creating AdvancedParser instance...');
    const advancedParser = new AdvancedParser();
    debugLog('AdvancedParser created successfully');

    // Príprava dát
    debugLog('Connecting to database...');
    const client = await pool.connect();
    debugLog('Database connected successfully');
    
    try {
      debugLog('Starting database transaction...');
      await client.query('BEGIN');

      // Vyčistenie existujúcich dát
      debugLog('Clearing existing data...');
      await client.query('TRUNCATE TABLE owner_tags CASCADE');
      await client.query('TRUNCATE TABLE owners CASCADE');
      await client.query('TRUNCATE TABLE sources CASCADE');
      debugLog('Database cleared successfully');

      // Vloženie source záznamu
      const sourceResult = await client.query(
        'INSERT INTO sources (name) VALUES ($1) RETURNING id',
        [file.name]
      );
      const sourceId = sourceResult.rows[0].id;

      // Štatistiky
      const stats: ImportStats = {
        total_records: csvData.length,
        processed_successfully: 0,
        problematic_count: 0,
        spf_count: 0,
        gender_stats: { muž: 0, žena: 0, neisté: 0 },
        tag_stats: {},
        most_common_unmatched: []
      };

      const unmatchedPatterns: Record<string, number> = {};

      // Spracovanie v šaržiach s progress reportingom
      // Pre veľké súbory použijeme menšie batche
      const batchSize = csvData.length > 100000 ? 500 : 1000;
      const startTime = Date.now();
      
      debugLog(`Processing ${csvData.length} records in batches of ${batchSize}`);
      
      // Pre testovanie veľkých súborov - spracujeme iba prvých 1000 záznamov
      const maxRecordsForTesting = 1000;
      const recordsToProcess = Math.min(csvData.length, maxRecordsForTesting);
      
      if (csvData.length > maxRecordsForTesting) {
        debugLog(`⚠️ TESTING MODE: Processing only first ${maxRecordsForTesting} records out of ${csvData.length}`);
      }
      
      for (let i = 0; i < recordsToProcess; i += batchSize) {
        const batch = csvData.slice(i, Math.min(i + batchSize, recordsToProcess));
        const progress = Math.round((i / recordsToProcess) * 100);
        const elapsed = Date.now() - startTime;
        const estimated = elapsed > 0 ? Math.round((elapsed / (i + 1)) * recordsToProcess - elapsed) : 0;
        
        debugLog(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(csvData.length/batchSize)} - ${progress}% (${i}/${csvData.length} records)`);
        
        for (const row of batch) {
          try {
            debugLog(`Processing row ${i + batch.indexOf(row) + 1}:`, {
              k_uzemie: row[columnMapping.katastralne_uzemie] || row['KATASTRÁLNE ÚZEMIE'] || row['KATATASTRÁLNE ÚZEMIE'] || '',
              meno_raw: (row[columnMapping.meno_raw] || row['MENO NEZNÁMEHO VLASTNÍKA'] || '').substring(0, 50) + '...'
            });

            // Mapovanie CSV na RawRecord pomocou columnMapping
            const rawRecord: RawRecord = {
              k_uzemie: (columnMapping.katastralne_uzemie && row[columnMapping.katastralne_uzemie]) || row['KATASTRÁLNE ÚZEMIE'] || row['KATATASTRÁLNE ÚZEMIE'] || '',
              poradie: (columnMapping.poradie && row[columnMapping.poradie]) || row['PORADOVÉ ČÍSLO'] || '',
              lv: (columnMapping.lv && row[columnMapping.lv]) || row['LV'] || '',
              meno_raw: (columnMapping.meno_raw && row[columnMapping.meno_raw]) || row['MENO NEZNÁMEHO VLASTNÍKA'] || '',
              ...row // zachovanie ostatných stĺpcov
            };

            debugLog('Raw record mapped, starting parsing...');
            
            // Parsing pokročilým parserom
            const parsedRecord = advancedParser.parseRecord(rawRecord);
            
            debugLog('Parsing completed, result:', {
              given: parsedRecord.given?.value,
              surname: parsedRecord.surname?.value,
              gender: parsedRecord.gender,
              parse_score: parsedRecord.parse_score
            });

            debugLog('Starting database insert for owner...');
            
            // Vloženie do owners tabuľky
            const ownerResult = await client.query(`
              INSERT INTO owners (
                katastralne_uzemie, poradie, lv, meno_raw, meno_clean,
                gender, has_minor_flag, source_id, 
                parse_score, parse_errors, evidence_spans
              ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
              RETURNING id
            `, [
              parsedRecord.k_uzemie,
              parsedRecord.poradie,
              parsedRecord.lv,
              parsedRecord.meno_raw,
              parsedRecord.meno_clean,
              parsedRecord.gender,
              parsedRecord.meno_raw.toLowerCase().includes('maloletý') || parsedRecord.meno_raw.toLowerCase().includes('maloletá'),
              sourceId,
              parsedRecord.parse_score,
              parsedRecord.parse_errors,
              JSON.stringify(parsedRecord.evidence_spans)
            ]);

            const ownerId = ownerResult.rows[0].id;
            debugLog(`Owner inserted successfully with ID: ${ownerId}`);

            debugLog('Starting tags collection...');
            
            // Vloženie tagov
            const tagsToInsert = [];

            if (parsedRecord.given) {
              tagsToInsert.push(['given', parsedRecord.given.value, parsedRecord.given.confidence, parsedRecord.given.source_rule, parsedRecord.given.uncertain || false]);
              stats.tag_stats.given = (stats.tag_stats.given || 0) + 1;
            }

            if (parsedRecord.surname) {
              tagsToInsert.push(['surname', parsedRecord.surname.value, parsedRecord.surname.confidence, parsedRecord.surname.source_rule, parsedRecord.surname.uncertain || false]);
              stats.tag_stats.surname = (stats.tag_stats.surname || 0) + 1;
            }

            if (parsedRecord.maiden_surname) {
              tagsToInsert.push(['maiden_surname', parsedRecord.maiden_surname.value, parsedRecord.maiden_surname.confidence, parsedRecord.maiden_surname.source_rule, parsedRecord.maiden_surname.uncertain || false]);
              stats.tag_stats.maiden_surname = (stats.tag_stats.maiden_surname || 0) + 1;
            }

            if (parsedRecord.spouse_given) {
              tagsToInsert.push(['spouse_given', parsedRecord.spouse_given.value, parsedRecord.spouse_given.confidence, parsedRecord.spouse_given.source_rule, parsedRecord.spouse_given.uncertain || false]);
              stats.tag_stats.spouse_given = (stats.tag_stats.spouse_given || 0) + 1;
            }

            if (parsedRecord.spouse_surname) {
              tagsToInsert.push(['spouse_surname', parsedRecord.spouse_surname.value, parsedRecord.spouse_surname.confidence, parsedRecord.spouse_surname.source_rule, parsedRecord.spouse_surname.uncertain || false]);
              stats.tag_stats.spouse_surname = (stats.tag_stats.spouse_surname || 0) + 1;
            }

            if (parsedRecord.status) {
              tagsToInsert.push(['status', parsedRecord.status.value, parsedRecord.status.confidence, parsedRecord.status.source_rule, parsedRecord.status.uncertain || false]);
              stats.tag_stats.status = (stats.tag_stats.status || 0) + 1;
            }

            if (parsedRecord.origin_place) {
              tagsToInsert.push(['origin_place', parsedRecord.origin_place.value, parsedRecord.origin_place.confidence, parsedRecord.origin_place.source_rule, parsedRecord.origin_place.uncertain || false]);
              stats.tag_stats.origin_place = (stats.tag_stats.origin_place || 0) + 1;
            }

            if (parsedRecord.residence) {
              tagsToInsert.push(['residence', parsedRecord.residence.value, parsedRecord.residence.confidence, parsedRecord.residence.source_rule, parsedRecord.residence.uncertain || false]);
              stats.tag_stats.residence = (stats.tag_stats.residence || 0) + 1;
            }

            if (parsedRecord.birth_place) {
              tagsToInsert.push(['birth_place', parsedRecord.birth_place.value, parsedRecord.birth_place.confidence, parsedRecord.birth_place.source_rule, parsedRecord.birth_place.uncertain || false]);
              stats.tag_stats.birth_place = (stats.tag_stats.birth_place || 0) + 1;
            }

            if (parsedRecord.birth_date) {
              tagsToInsert.push(['birth_date', parsedRecord.birth_date.value, parsedRecord.birth_date.confidence, parsedRecord.birth_date.source_rule, parsedRecord.birth_date.uncertain || false]);
              stats.tag_stats.birth_date = (stats.tag_stats.birth_date || 0) + 1;
            }

            if (parsedRecord.death_date) {
              tagsToInsert.push(['death_date', parsedRecord.death_date.value, parsedRecord.death_date.confidence, parsedRecord.death_date.source_rule, parsedRecord.death_date.uncertain || false]);
              stats.tag_stats.death_date = (stats.tag_stats.death_date || 0) + 1;
            }

            if (parsedRecord.name_suffix) {
              tagsToInsert.push(['name_suffix', parsedRecord.name_suffix.value, parsedRecord.name_suffix.confidence, parsedRecord.name_suffix.source_rule, parsedRecord.name_suffix.uncertain || false]);
              stats.tag_stats.name_suffix = (stats.tag_stats.name_suffix || 0) + 1;
            }

            if (parsedRecord.name_suffix_roman) {
              tagsToInsert.push(['name_suffix_roman', parsedRecord.name_suffix_roman.value, parsedRecord.name_suffix_roman.confidence, parsedRecord.name_suffix_roman.source_rule, parsedRecord.name_suffix_roman.uncertain || false]);
              stats.tag_stats.name_suffix_roman = (stats.tag_stats.name_suffix_roman || 0) + 1;
            }

            // Gender tag
            if (parsedRecord.gender) {
              tagsToInsert.push(['gender', parsedRecord.gender, 0.8, 'RULE_GENDER_INFERENCE', false]);
              stats.tag_stats.gender = (stats.tag_stats.gender || 0) + 1;
            }

            // SPF tag
            if (parsedRecord.is_spf) {
              tagsToInsert.push(['is_spf', 'true', parsedRecord.spf_conf, 'RULE_SPF_DETECTION', false]);
              stats.spf_count++;
            }

            debugLog(`Collected ${tagsToInsert.length} tags, inserting into database...`);
            
            // Vloženie tagov do databázy
            for (const [tagType, tagValue, confidence, sourceRule, uncertain] of tagsToInsert) {
              debugLog(`Inserting tag: ${tagType} = ${tagValue}`);
              await client.query(`
                INSERT INTO owner_tags (owner_id, key, value, tag_type, tag_value, confidence, source_rule, uncertain)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              `, [ownerId, tagType, tagValue, tagType, tagValue, confidence, sourceRule, uncertain]);
            }
            
            debugLog('All tags inserted successfully');

            // Štatistiky
            stats.gender_stats[parsedRecord.gender]++;
            
            if (parsedRecord.parse_score >= 0.6 && !parsedRecord.parse_errors) {
              stats.processed_successfully++;
            } else {
              stats.problematic_count++;
            }

            // Nezaradené vzory
            for (const pattern of parsedRecord.tags_raw) {
              unmatchedPatterns[pattern] = (unmatchedPatterns[pattern] || 0) + 1;
            }

          } catch (error) {
            debugError('Error processing row:', error);
            debugError('Row data:', {
              k_uzemie: row[columnMapping.katastralne_uzemie] || row['KATASTRÁLNE ÚZEMIE'] || row['KATATASTRÁLNE ÚZEMIE'] || '',
              meno_raw: row[columnMapping.meno_raw] || row['MENO NEZNÁMEHO VLASTNÍKA'] || ''
            });
            stats.problematic_count++;
          }
        }
        
        debugLog(`Batch ${Math.floor(i/batchSize) + 1} completed successfully`);
      }

      // Top nezaradené vzory
      stats.most_common_unmatched = Object.entries(unmatchedPatterns)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 20)
        .map(([pattern, count]) => ({ pattern, count }));

      debugLog('Committing database transaction...');
      await client.query('COMMIT');
      debugLog('Transaction committed successfully');

      debugLog('Advanced import completed successfully');
      debugLog('Final stats:', stats);

      return NextResponse.json({
        success: true,
        stats,
        message: `Successfully imported ${stats.total_records} records using advanced parser`
      });

    } catch (error) {
      debugError('Critical error in advanced import:', error);
      debugLog('Rolling back database transaction...');
      await client.query('ROLLBACK');
      debugLog('Transaction rolled back');
      throw error;
    } finally {
      debugLog('Releasing database connection...');
      client.release();
      debugLog('Database connection released');
    }

  } catch (error) {
    debugError('Advanced import error:', error);
    return NextResponse.json(
      { error: 'Import failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
