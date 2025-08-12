import { NextRequest, NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { normalizeText, hasMinorFlag, detectGender, generateTags } from '@/lib/normalize';
import { debugLog, debugError, debugAPI } from '@/lib/debug';
import Papa from 'papaparse';

interface CSVRow {
  [key: string]: string;
}

interface ProgressUpdate {
  phase: 'parsing' | 'processing' | 'inserting' | 'tagging' | 'completed' | 'error';
  progress: number; // 0-100
  totalRows: number;
  processedRows: number;
  currentRow?: number;
  message: string;
  timeElapsed: number;
  estimatedTimeRemaining?: number;
  errors: string[];
  successfulRows?: number;
  sourceId?: number;
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  debugAPI('POST', '/api/import-progress', 'Starting CSV import with progress');
  
  // Set up Server-Sent Events response
  const encoder = new TextEncoder();
  
  const stream = new ReadableStream({
    start(controller) {
      processImportWithProgress(request, controller, encoder, startTime);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

async function processImportWithProgress(
  request: NextRequest,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  startTime: number
) {
  function sendProgress(update: ProgressUpdate) {
    const data = `data: ${JSON.stringify(update)}\n\n`;
    controller.enqueue(encoder.encode(data));
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    let delimiter = (formData.get('delimiter') as string) || ',';
    // Fix for delimiter parsing
    if (delimiter === '' || delimiter === null || delimiter === undefined) {
      delimiter = ';'; // default to semicolon
    }
    const columnMappingString = formData.get('columnMapping') as string;
    
    if (!file) {
      sendProgress({
        phase: 'error',
        progress: 0,
        totalRows: 0,
        processedRows: 0,
        message: 'Súbor nie je priložený',
        timeElapsed: Date.now() - startTime,
        errors: ['Súbor nie je priložený']
      });
      controller.close();
      return;
    }

    if (!columnMappingString) {
      sendProgress({
        phase: 'error',
        progress: 0,
        totalRows: 0,
        processedRows: 0,
        message: 'Mapovanie stĺpcov nie je definované',
        timeElapsed: Date.now() - startTime,
        errors: ['Mapovanie stĺpcov nie je definované']
      });
      controller.close();
      return;
    }

    const columnMapping = JSON.parse(columnMappingString);
    
    // Phase 1: Parsing CSV
    sendProgress({
      phase: 'parsing',
      progress: 0,
      totalRows: 0,
      processedRows: 0,
      message: 'Parsovanie CSV súboru...',
      timeElapsed: Date.now() - startTime,
      errors: []
    });

    const csvText = await file.text();

    
    const parseResult = Papa.parse(csvText, {
      header: true,
      delimiter: delimiter,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
      skipErrors: true
    });

    if (parseResult.errors.length > 0) {
      const errorMessages = parseResult.errors.map(err => `Riadok ${err.row}: ${err.message}`);
      sendProgress({
        phase: 'error',
        progress: 0,
        totalRows: 0,
        processedRows: 0,
        message: 'Chyba pri parsovaní CSV',
        timeElapsed: Date.now() - startTime,
        errors: errorMessages
      });
      controller.close();
      return;
    }

    let rows = parseResult.data as CSVRow[];
    
    // Odstránenie prázdnych riadkov
    rows = rows.filter(row => {
      const hasData = Object.values(row).some(value => value && value.toString().trim() !== '');
      return hasData;
    });
    
    const totalRows = rows.length;

    sendProgress({
      phase: 'parsing',
      progress: 100,
      totalRows,
      processedRows: 0,
      message: `CSV súbor úspešne parsovaný. Nájdených ${totalRows} riadkov.`,
      timeElapsed: Date.now() - startTime,
      errors: []
    });

    // Phase 2: Database connection and setup
    sendProgress({
      phase: 'processing',
      progress: 0,
      totalRows,
      processedRows: 0,
      message: 'Pripájanie k databáze...',
      timeElapsed: Date.now() - startTime,
      errors: []
    });

    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create source record
      const sourceResult = await client.query(
        'INSERT INTO sources (name, imported_at) VALUES ($1, NOW()) RETURNING id',
        [file.name]
      );
      const sourceId = sourceResult.rows[0].id;

      sendProgress({
        phase: 'processing',
        progress: 5,
        totalRows,
        processedRows: 0,
        message: 'Spracovávanie záznamov...',
        timeElapsed: Date.now() - startTime,
        errors: [],
        sourceId
      });

      // Phase 3: Process rows in batches
      const batchSize = 1000;
      const stats = {
        sourceId,
        totalRows,
        successfulRows: 0,
        errors: [] as string[]
      };

      const ownerInserts: any[][] = [];
      const allTags: any[][] = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const currentTime = Date.now();
        const timeElapsed = currentTime - startTime;
        
        // Calculate progress and ETA
        const progress = Math.floor(((i + 1) / totalRows) * 80) + 10; // 10-90% for processing
        const rowsPerSecond = (i + 1) / (timeElapsed / 1000);
        const remainingRows = totalRows - (i + 1);
        const estimatedTimeRemaining = remainingRows > 0 ? Math.floor(remainingRows / rowsPerSecond) * 1000 : 0;

        // Send progress update every 100 rows or on significant milestones
        if (i % 100 === 0 || i === totalRows - 1) {
          sendProgress({
            phase: 'processing',
            progress,
            totalRows,
            processedRows: i + 1,
            currentRow: i + 1,
            message: `Spracovávanie riadku ${i + 1} z ${totalRows}...`,
            timeElapsed,
            estimatedTimeRemaining,
            errors: stats.errors,
            successfulRows: stats.successfulRows
          });
        }

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

          // Generate tags - temporarily disabled for debugging
          // const tags = generateTags(meno_raw);
          // const ownerIndex = ownerInserts.length - 1; // Current owner index (after push)
          // for (const tag of tags) {
          //   allTags.push([ownerIndex, tag.key, tag.value, tag.uncertain]);
          // }

        } catch (error) {
          stats.errors.push(`Riadok ${i + 2}: ${(error as Error).message}`);
        }

        // Process batch if reached batch size
        if (ownerInserts.length >= batchSize) {
          await processBatch(client, ownerInserts, allTags, sendProgress, totalRows, i + 1, timeElapsed);
          ownerInserts.length = 0;
          allTags.length = 0;
        }
      }

      // Process remaining batch
      if (ownerInserts.length > 0) {
        await processBatch(client, ownerInserts, allTags, sendProgress, totalRows, totalRows, Date.now() - startTime);
      }

      await client.query('COMMIT');

      // Final success message
      sendProgress({
        phase: 'completed',
        progress: 100,
        totalRows,
        processedRows: totalRows,
        message: `Import dokončený! ${stats.successfulRows} úspešných záznamov z ${totalRows}.`,
        timeElapsed: Date.now() - startTime,
        errors: stats.errors,
        successfulRows: stats.successfulRows,
        sourceId
      });

    } catch (error) {
      await client.query('ROLLBACK');
      sendProgress({
        phase: 'error',
        progress: 0,
        totalRows,
        processedRows: 0,
        message: `Chyba pri importe: ${(error as Error).message}`,
        timeElapsed: Date.now() - startTime,
        errors: [(error as Error).message]
      });
    } finally {
      client.release();
    }

  } catch (error) {
    sendProgress({
      phase: 'error',
      progress: 0,
      totalRows: 0,
      processedRows: 0,
      message: `Chyba: ${(error as Error).message}`,
      timeElapsed: Date.now() - startTime,
      errors: [(error as Error).message]
    });
  } finally {
    controller.close();
  }
}

async function processBatch(
  client: any,
  ownerInserts: any[][],
  allTags: any[][],
  sendProgress: (update: ProgressUpdate) => void,
  totalRows: number,
  processedRows: number,
  timeElapsed: number
) {
  // Insert owners batch
  const ownerValues = ownerInserts.map((_, index) => {
    const baseIndex = index * 8;
    return `($${baseIndex + 1}, $${baseIndex + 2}, $${baseIndex + 3}, $${baseIndex + 4}, $${baseIndex + 5}, $${baseIndex + 6}, $${baseIndex + 7}, $${baseIndex + 8})`;
  }).join(', ');

  const ownerParams = ownerInserts.flat();
  const ownerQuery = `
    INSERT INTO owners (source_id, katastralne_uzemie, poradie, lv, meno_raw, meno_clean, gender, has_minor_flag)
    VALUES ${ownerValues}
    RETURNING id
  `;

  const ownerResult = await client.query(ownerQuery, ownerParams);
  const insertedOwnerIds = ownerResult.rows.map((row: any) => row.id);

  // Insert tags batch
  if (allTags.length > 0) {
    const tagValues: string[] = [];
    const tagParams: any[] = [];

    for (const [ownerIndex, key, value, uncertain] of allTags) {
      const ownerId = insertedOwnerIds[ownerIndex];
      if (ownerId) {
        const baseIdx = tagParams.length;
        tagValues.push(`($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4})`);
        tagParams.push(ownerId, key, value, uncertain);
      }
    }

    if (tagValues.length > 0) {
      const tagQuery = `
        INSERT INTO owner_tags (owner_id, key, value, uncertain)
        VALUES ${tagValues.join(', ')}
      `;
      await client.query(tagQuery, tagParams);
    }
  }

  sendProgress({
    phase: 'inserting',
    progress: Math.floor((processedRows / totalRows) * 90) + 5,
    totalRows,
    processedRows,
    message: `Vkladanie do databázy... ${processedRows}/${totalRows}`,
    timeElapsed,
    errors: []
  });
}
