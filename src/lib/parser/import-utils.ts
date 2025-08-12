import Papa from 'papaparse';
import { RawRecord, ColumnMapping, ImportResult } from './types';
import { AdvancedParser } from './advanced-parser';

export class ImportUtils {
  private parser: AdvancedParser;

  constructor() {
    this.parser = new AdvancedParser();
  }

  /**
   * Detekcia formátu súboru
   */
  detectFileFormat(file: File): 'csv' | 'xlsx' | 'unsupported' {
    const extension = file.name.toLowerCase().split('.').pop();
    
    switch (extension) {
      case 'csv':
      case 'tsv':
        return 'csv';
      case 'xlsx':
      case 'xls':
        return 'xlsx';
      default:
        return 'unsupported';
    }
  }

  /**
   * Načítanie a parsing CSV súboru
   */
  async parseCSV(file: File): Promise<{ headers: string[]; preview: any[]; data: any[] }> {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        encoding: 'UTF-8',
        complete: (results) => {
          if (results.errors.length > 0) {
            console.warn('CSV parsing warnings:', results.errors);
          }

          const headers = results.meta.fields || [];
          const data = results.data as any[];
          const preview = data.slice(0, 10); // prvých 10 riadkov pre náhľad

          resolve({ headers, preview, data });
        },
        error: (error) => {
          reject(new Error(`CSV parsing error: ${error.message}`));
        }
      });
    });
  }

  /**
   * Načítanie XLSX súboru (placeholder - potrebuje SheetJS)
   */
  async parseXLSX(file: File): Promise<{ headers: string[]; preview: any[]; data: any[] }> {
    // TODO: Implementovať s SheetJS knižnicou
    throw new Error('XLSX support not implemented yet. Please use CSV format.');
  }

  /**
   * Auto-detekcia mapovania stĺpcov
   */
  autoDetectMapping(headers: string[]): Partial<ColumnMapping> {
    const mapping: Partial<ColumnMapping> = {};
    
    const lowerHeaders = headers.map(h => h.toLowerCase().trim());

    // Katastrálne územie
    for (let i = 0; i < lowerHeaders.length; i++) {
      const header = lowerHeaders[i];
      if (header.includes('katastráln') || header.includes('územie') || header.includes('obec')) {
        mapping.k_uzemie = headers[i];
        break;
      }
    }

    // Poradie
    for (let i = 0; i < lowerHeaders.length; i++) {
      const header = lowerHeaders[i];
      if (header.includes('poradie') || header.includes('porađové') || header === 'porad') {
        mapping.poradie = headers[i];
        break;
      }
    }

    // LV
    for (let i = 0; i < lowerHeaders.length; i++) {
      const header = lowerHeaders[i];
      if (header === 'lv' || header.includes('list') && header.includes('vlastn')) {
        mapping.lv = headers[i];
        break;
      }
    }

    // Meno
    for (let i = 0; i < lowerHeaders.length; i++) {
      const header = lowerHeaders[i];
      if (header.includes('meno') || header.includes('vlastník') || header.includes('name')) {
        mapping.meno_raw = headers[i];
        break;
      }
    }

    return mapping;
  }

  /**
   * Validácia mapovania stĺpcov
   */
  validateMapping(mapping: ColumnMapping, headers: string[]): string[] {
    const errors: string[] = [];
    const requiredFields = ['k_uzemie', 'poradie', 'lv', 'meno_raw'];

    for (const field of requiredFields) {
      if (!mapping[field as keyof ColumnMapping]) {
        errors.push(`Chýba mapovanie pre povinné pole: ${field}`);
      } else if (!headers.includes(mapping[field as keyof ColumnMapping])) {
        errors.push(`Stĺpec "${mapping[field as keyof ColumnMapping]}" neexistuje v súbore`);
      }
    }

    return errors;
  }

  /**
   * Transformácia raw dát na RawRecord objekty
   */
  transformData(data: any[], mapping: ColumnMapping): RawRecord[] {
    return data.map(row => ({
      k_uzemie: row[mapping.k_uzemie] || '',
      poradie: row[mapping.poradie] || '',
      lv: row[mapping.lv] || '',
      meno_raw: row[mapping.meno_raw] || '',
      ...row // zachovanie ostatných stĺpcov
    }));
  }

  /**
   * Spracovanie importu s progress callbackom
   */
  async processImport(
    rawRecords: RawRecord[],
    onProgress?: (processed: number, total: number) => void
  ): Promise<ImportResult> {
    const total = rawRecords.length;
    const parsed = [];
    const errors = [];
    let parsedSuccessfully = 0;
    let problematicCount = 0;
    let spfCount = 0;
    const tagStats: Record<string, number> = {};
    const unmatchedPatterns: Record<string, number> = {};

    // Spracovanie v šaržiach pre výkon
    const batchSize = 1000;
    
    for (let i = 0; i < total; i += batchSize) {
      const batch = rawRecords.slice(i, Math.min(i + batchSize, total));
      
      for (const rawRecord of batch) {
        try {
          const parsedRecord = this.parser.parseRecord(rawRecord);
          parsed.push(parsedRecord);

          // Štatistiky
          if (parsedRecord.parse_score >= 0.6 && !parsedRecord.parse_errors) {
            parsedSuccessfully++;
          } else {
            problematicCount++;
          }

          if (parsedRecord.is_spf) {
            spfCount++;
          }

          // Počítanie tagov
          if (parsedRecord.given) tagStats['given'] = (tagStats['given'] || 0) + 1;
          if (parsedRecord.surname) tagStats['surname'] = (tagStats['surname'] || 0) + 1;
          if (parsedRecord.maiden_surname) tagStats['maiden_surname'] = (tagStats['maiden_surname'] || 0) + 1;
          if (parsedRecord.spouse_given) tagStats['spouse_given'] = (tagStats['spouse_given'] || 0) + 1;
          if (parsedRecord.status) tagStats['status'] = (tagStats['status'] || 0) + 1;
          if (parsedRecord.birth_date) tagStats['birth_date'] = (tagStats['birth_date'] || 0) + 1;
          if (parsedRecord.death_date) tagStats['death_date'] = (tagStats['death_date'] || 0) + 1;

          // Nezhoda vzory
          for (const unmatchedTag of parsedRecord.tags_raw) {
            unmatchedPatterns[unmatchedTag] = (unmatchedPatterns[unmatchedTag] || 0) + 1;
          }

        } catch (error) {
          errors.push(`Riadok ${i + 1}: ${error instanceof Error ? error.message : 'Neznáma chyba'}`);
        }

        // Progress callback
        if (onProgress && (i % 100 === 0 || i === total - 1)) {
          onProgress(i + 1, total);
        }
      }
    }

    // Top 20 najčastejších neznámych vzorov
    const mostCommonUnmatched = Object.entries(unmatchedPatterns)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([pattern, count]) => ({ pattern, count }));

    return {
      records: parsed,
      stats: {
        total_records: total,
        parsed_successfully: parsedSuccessfully,
        problematic_count: problematicCount,
        spf_count: spfCount,
        tag_stats: tagStats,
        most_common_unmatched: mostCommonUnmatched
      },
      errors
    };
  }

  /**
   * Export do CSV formátu
   */
  exportToCSV(records: any[], filename: string = 'export.csv'): void {
    const csv = Papa.unparse(records);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Export do JSON formátu
   */
  exportToJSON(records: any[], filename: string = 'export.json'): void {
    const json = JSON.stringify(records, null, 2);
    const blob = new Blob([json], { type: 'application/json;charset=utf-8;' });
    const link = document.createElement('a');
    
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Export do NDJSON formátu (jeden JSON objekt na riadok)
   */
  exportToNDJSON(records: any[], filename: string = 'export.ndjson'): void {
    const ndjson = records.map(record => JSON.stringify(record)).join('\n');
    const blob = new Blob([ndjson], { type: 'application/x-ndjson;charset=utf-8;' });
    const link = document.createElement('a');
    
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

