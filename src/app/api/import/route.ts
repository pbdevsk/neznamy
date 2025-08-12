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
      await client.query(
        'INSERT INTO sources (name) VALUES (?)',
        [file.name]
      );
      
      // Získanie ID posledného vloženého záznamu
      const sourceResult = await client.query('SELECT last_insert_rowid() as id');
      stats.sourceId = sourceResult.rows[0].id;

      // SQLite optimized import
      debugLog('Processing rows', { totalRows: rows.length });

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

          // Insert owner
          await client.query(
            'INSERT INTO owners (source_id, katastralne_uzemie, poradie, lv, meno_raw, meno_clean, gender, has_minor_flag) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [stats.sourceId, katastralne_uzemie, poradie, lv, meno_raw, meno_clean, gender, has_minor_flag ? 1 : 0]
          );
          
          // Získanie ID posledného vloženého vlastníka
          const ownerResult = await client.query('SELECT last_insert_rowid() as id');
          const ownerId = ownerResult.rows[0]?.id;
          if (!ownerId) continue;

          // Generate and insert tags
          const tags = generateTags(meno_raw);
          for (const tag of tags) {
            await client.query(
              'INSERT INTO owner_tags (owner_id, key, value, uncertain) VALUES (?, ?, ?, ?)',
              [ownerId, tag.key, tag.value, tag.uncertain ? 1 : 0]
            );
          }

          stats.successfulRows++;
        } catch (error) {
          stats.errors.push(`Riadok ${i + 2}: ${error instanceof Error ? error.message : 'Neznáma chyba'}`);
        }

        // Progress reporting every 1000 rows
        if ((i + 1) % 1000 === 0) {
          debugLog('Progress', { processed: i + 1, total: rows.length, percentage: Math.round(((i + 1) / rows.length) * 100) });
        }
      }

      debugLog('Import complete', { 
        successfulRows: stats.successfulRows, 
        errors: stats.errors.length 
      });

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

