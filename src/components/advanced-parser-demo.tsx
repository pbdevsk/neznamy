'use client';

import React, { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { AdvancedParser } from '@/lib/parser/advanced-parser';
import { ParsedRecord, RawRecord } from '@/lib/parser/types';
import { generateTags } from '@/lib/normalize';
import { mergeTags, MergedTag, getConflicts } from '@/lib/parser/tag-merger';
import { ThemeToggle } from '@/components/theme-toggle';
import { createZbgisLvUrl } from '@/lib/map-utils';
import { Database, Upload, FileText, BarChart3, Filter, Download, ExternalLink, MapPin, FileDown, Map as MapIcon, ChevronDown, ChevronRight } from 'lucide-react';

interface ProcessedRow {
  originalIndex: number; // Riadok v CSV (pre debug)
  poradie: string; // Poradové číslo z CSV
  katastralne_uzemie: string; // Katastrálne územie z CSV
  lv: string; // LV z CSV
  meno_raw: string; // Pôvodné meno z CSV
  parsed: ParsedRecord;
  systemTags: Array<{key: string; value: string; uncertain: boolean}>;
  mergedTags: MergedTag[];
  conflicts: MergedTag[];
}

// Helper funkcia pre farby väzieb
function getRelationColor(relation: string): string {
  switch (relation) {
    case 'manželia': return 'bg-red-100 text-red-800';
    case 'rodič-dieťa': return 'bg-green-100 text-green-800';
    case 'dieťa-rodič': return 'bg-green-100 text-green-800';
    case 'súrodenci': return 'bg-blue-100 text-blue-800';
    case 'príbuzní': return 'bg-yellow-100 text-yellow-800';
    case 'spoluvlastníci': return 'bg-gray-100 text-gray-800';
    default: return 'bg-purple-100 text-purple-800';
  }
}

// Sortovateľná hlavička stĺpca
const SortableHeader = ({ field, children, className = "", handleSort, sortField, sortDirection }: { 
  field: string; 
  children: React.ReactNode; 
  className?: string;
  handleSort: (field: string) => void;
  sortField: string;
  sortDirection: 'asc' | 'desc';
}) => (
  <th 
    className={`px-3 py-3 text-left font-semibold cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors ${className}`}
    onClick={() => handleSort(field)}
    title={`Zoradiť podľa ${children}`}
  >
    <div className="flex items-center gap-1">
      {children}
      {sortField === field && (
        <span className="text-blue-600">
          {sortDirection === 'asc' ? '↑' : '↓'}
        </span>
      )}
    </div>
  </th>
);

interface AdvancedParserDemoProps {
  onImportSuccess?: () => void;
}

export function AdvancedParserDemo({ onImportSuccess }: AdvancedParserDemoProps = {}) {
  const [file, setFile] = useState<File | null>(null);
  const [delimiter, setDelimiter] = useState<string>(';');
  const [columnMapping, setColumnMapping] = useState<{[key: string]: string}>({});
  const [processedRows, setProcessedRows] = useState<ProcessedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importStatus, setImportStatus] = useState<string>('');
  const [progress, setProgress] = useState(0);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [parser] = useState(() => new AdvancedParser());
  const [copySuccess, setCopySuccess] = useState<number | null>(null);
  const [familyRelations, setFamilyRelations] = useState<any>(null);
  const [isAnalyzingFamily, setIsAnalyzingFamily] = useState(false);
  const [lastSourceId, setLastSourceId] = useState<number | null>(null);
  const [selectedLV, setSelectedLV] = useState<string | null>(null);
  
  // Sorting state
  const [sortField, setSortField] = useState<string>('poradie');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  // Search state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedGender, setSelectedGender] = useState<string>('all');
  
  // LV filtering state
  const [selectedLVFilter, setSelectedLVFilter] = useState<{lv: string; poradie: string} | null>(null);
  
  // Accordion state for expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  // Sorting funkcia
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Funkcia na získanie hodnoty pre sorting
  const getSortValue = (row: ProcessedRow, field: string): string | number => {
    switch (field) {
      case 'poradie':
        return parseInt(row.poradie) || 0;
      case 'krstne_meno':
        return row.mergedTags.find(t => t.key === 'krstné_meno')?.value || '';
      case 'priezvisko':
        return row.mergedTags.find(t => t.key === 'priezvisko')?.value || '';
      case 'katastralne_uzemie':
        return row.katastralne_uzemie;
      case 'lv':
        return parseInt(row.lv) || 0;
      case 'pohlavie':
        return row.parsed.gender || '';
      default:
        return '';
    }
  };

  // Funkcia na pekné formátovanie názvov tagov
  const formatTagName = (tagKey: string): string => {
    const tagNames: { [key: string]: string } = {
      'krstné_meno': 'Krstné meno',
      'priezvisko': 'Priezvisko', 
      'rodné_priezvisko': 'Rodné priezvisko',
      'manželka': 'Manželka',
      'manžel': 'Manžel',
      'manželka_rodné': 'Manželka rodné',
      'otec': 'Otec',
      'matka': 'Matka',
      'syn': 'Syn',
      'dcéra': 'Dcéra',
      'adresa': 'Adresa',
      '✝️': '✝️',
      'maloletý': 'Maloletý',
      'vdova': 'Vdova'
    };
    
    return tagNames[tagKey] || tagKey.charAt(0).toUpperCase() + tagKey.slice(1).replace(/_/g, ' ');
  };

  // Definované poradie tagov pre konzistentné zobrazenie
  const tagDisplayOrder = [
    'rodné_priezvisko', 'manželka', 'manžel', 'manželka_rodné', 
    'otec', 'matka', 'syn', 'dcéra', 
    'adresa', '✝️', 'maloletý', 'vdova'
  ];

  // Funkcia na získanie tagov v správnom poradí (bez základných mien)
  const getOrderedTags = (mergedTags: MergedTag[]) => {
    const tagMap = new Map(mergedTags.map(tag => [tag.key, tag]));
    const orderedTags: MergedTag[] = [];
    
    // Pridaj tagy v definovanom poradí
    tagDisplayOrder.forEach(tagKey => {
      const tag = tagMap.get(tagKey);
      if (tag) {
        orderedTags.push(tag);
        tagMap.delete(tagKey);
      }
    });
    
    // Pridaj zvyšné tagy ktoré nie sú v definovanom poradí
    Array.from(tagMap.values())
      .filter(tag => !['krstné_meno', 'priezvisko'].includes(tag.key)) // Vynechaj základné mená (už sú v stĺpcoch)
      .forEach(tag => orderedTags.push(tag));
    
    return orderedTags;
  };

  // Funkcia na získanie farby pre pohlavie
  const getGenderColor = (gender: string) => {
    switch (gender) {
      case 'muž': return 'bg-blue-500';
      case 'žena': return 'bg-pink-500';
      default: return 'bg-gray-400';
    }
  };

  // Funkcie pre tlačidlá (použité URL z hlavnej aplikácie)
  const openLVPdf = (lv: string, poradie: string) => {
    // Skutočné kataster PDF URL z hlavnej aplikácie
    const lvUrl = `https://kataster.skgeodesy.sk/Portal45/api/Bo/GeneratePrfPublic/?cadastralUnitCode=${poradie}&prfNumber=${lv}&outputType=pdf`;
    window.open(lvUrl, '_blank');
  };

  const openZGBIS = (lv: string, poradie: string) => {
    // Použitie skutočnej ZBGIS LV URL z hlavnej aplikácie
    const zbgisUrl = createZbgisLvUrl(parseInt(poradie), parseInt(lv));
    window.open(zbgisUrl, '_blank');
  };

  const openGoogleMaps = (katastralne_uzemie: string) => {
    const searchQuery = encodeURIComponent(`${katastralne_uzemie}, Slovensko`);
    window.open(`https://www.google.com/maps/search/${searchQuery}`, '_blank');
  };

  // Funkcia na získanie ďalších LV pre osobu v rovnakej obci
  const getAdditionalLVs = (currentRow: ProcessedRow): Array<{lv: string; poradie: string}> => {
    const krstneMeno = currentRow.mergedTags.find(t => t.key === 'krstné_meno')?.value;
    const priezvisko = currentRow.mergedTags.find(t => t.key === 'priezvisko')?.value;
    
    if (!krstneMeno || !priezvisko) return [];
    
    // Nájdi všetky riadky s rovnakým menom a priezviskom v rovnakej obci
    const samePersonRows = processedRows.filter(row => {
      const rowKrstneMeno = row.mergedTags.find(t => t.key === 'krstné_meno')?.value;
      const rowPriezvisko = row.mergedTags.find(t => t.key === 'priezvisko')?.value;
      
      return row.katastralne_uzemie === currentRow.katastralne_uzemie &&
             rowKrstneMeno === krstneMeno &&
             rowPriezvisko === priezvisko &&
             row.lv !== currentRow.lv; // Iné LV
    });
    
    // Získaj unikátne LV čísla s poradím
    const uniqueLVs = new Map<string, string>();
    samePersonRows.forEach(row => {
      if (!uniqueLVs.has(row.lv)) {
        uniqueLVs.set(row.lv, row.poradie);
      }
    });
    
    return Array.from(uniqueLVs.entries()).map(([lv, poradie]) => ({ lv, poradie }));
  };

  // Funkcia na toggle expandovania riadku
  const toggleRowExpansion = (rowIndex: number) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(rowIndex)) {
        newSet.delete(rowIndex);
      } else {
        newSet.add(rowIndex);
      }
      return newSet;
    });
  };

  // Sortované a filtrované dáta
  const sortedAndFilteredRows = useMemo(() => {
    let filtered = processedRows.filter(row => {
      // LV + Poradie filter (nový presnejší filter)
      if (selectedLVFilter && (row.lv !== selectedLVFilter.lv || row.poradie !== selectedLVFilter.poradie)) return false;
      
      // Starý LV filter (zachovaný pre kompatibilitu)
      if (selectedLV && row.lv !== selectedLV && !selectedLVFilter) return false;
      
      // Gender filter
      if (selectedGender !== 'all' && row.parsed.gender !== selectedGender) return false;
      
      // Search query filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesName = row.meno_raw.toLowerCase().includes(query);
        const matchesKrstneMeno = row.mergedTags.find(t => t.key === 'krstné_meno')?.value.toLowerCase().includes(query);
        const matchesPriezvisko = row.mergedTags.find(t => t.key === 'priezvisko')?.value.toLowerCase().includes(query);
        const matchesUzemie = row.katastralne_uzemie.toLowerCase().includes(query);
        
        if (!matchesName && !matchesKrstneMeno && !matchesPriezvisko && !matchesUzemie) return false;
      }
      
      return true;
    });
    
    return filtered.sort((a, b) => {
      const aVal = getSortValue(a, sortField);
      const bVal = getSortValue(b, sortField);
      
      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal, 'sk');
      } else {
        comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
      }
      
      return sortDirection === 'desc' ? -comparison : comparison;
    });
  }, [processedRows, selectedLV, selectedLVFilter, selectedGender, searchQuery, sortField, sortDirection]);

  // Štatistiky
  const stats = useMemo(() => {
    if (processedRows.length === 0) return null;

    const totalRows = processedRows.length;
    const byGender = processedRows.reduce((acc, row) => {
      acc[row.parsed.gender] = (acc[row.parsed.gender] || 0) + 1;
      return acc;
    }, {} as {[key: string]: number});
    
    // Štatistiky konfliktov
    const totalConflicts = processedRows.reduce((sum, row) => sum + row.conflicts.length, 0);
    const conflictRate = (totalConflicts / totalRows) * 100;

    const avgParseScore = processedRows.reduce((sum, row) => sum + row.parsed.parse_score, 0) / totalRows;
    
    const spfCount = processedRows.filter(row => row.parsed.is_spf).length;

    return {
      totalRows,
      byGender,
      avgParseScore,
      spfCount,
      totalConflicts,
      conflictRate,
    };
  }, [processedRows]);

  // Import do databázy
  const importToDatabase = async () => {
    if (!file || processedRows.length === 0) return;

    setIsImporting(true);
    setImportStatus('Pripravujem import...');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('delimiter', delimiter);
      formData.append('columnMapping', JSON.stringify(columnMapping));

      const response = await fetch('/api/import', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Import zlyhal');
      }

      const result = await response.json();
      setImportStatus(`Import úspešný! Importované: ${result.successfulRows} záznamov`);
      
      // Zavolaj callback po úspešnom importe
      if (onImportSuccess) {
        setTimeout(() => {
          onImportSuccess();
        }, 1500);
      }
    } catch (error) {
      setImportStatus(`Chyba pri importe: ${error instanceof Error ? error.message : 'Neznáma chyba'}`);
    } finally {
      setIsImporting(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      
      // Parse pre náhľad hlavičiek
      const reader = new FileReader();
      reader.onload = (e) => {
        const csvText = e.target?.result as string;
        const parsed = Papa.parse(csvText, {
          delimiter,
          header: false,
          skipEmptyLines: true
        });
        
        if (parsed.data.length > 0) {
          setCsvHeaders(parsed.data[0] as string[]);
          
          // Auto-mapovanie stĺpcov
          const headers = parsed.data[0] as string[];
          const mapping: {[key: string]: string} = {};
          
          headers.forEach(header => {
            const normalizedHeader = header.toLowerCase();
            if (normalizedHeader.includes('územie')) {
              mapping.katastralne_uzemie = header;
            } else if (normalizedHeader.includes('poradové') || normalizedHeader.includes('poradie')) {
              mapping.poradie = header;
            } else if (normalizedHeader.includes('lv')) {
              mapping.lv = header;
            } else if (normalizedHeader.includes('meno')) {
              mapping.meno = header;
            }
          });
          
          setColumnMapping(mapping);
        }
      };
      reader.readAsText(selectedFile, 'UTF-8');
    }
  };

  const processFile = async () => {
    if (!file) return;
    
    setIsProcessing(true);
    setProgress(0);
    
    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvText = e.target?.result as string;
      
      const parsed = Papa.parse(csvText, {
        delimiter,
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.trim()
      });
      
      const data = parsed.data as any[];
      const maxRows = Math.min(data.length, 100000);
      const processed: ProcessedRow[] = [];
      
      for (let i = 0; i < maxRows; i++) {
        const row = data[i];
        const meno_raw = row[columnMapping.meno];
        
        if (!meno_raw) continue;
        
        const rawRecord: RawRecord = {
          id: i + 1,
          meno_raw,
          katastralne_uzemie: row[columnMapping.katastralne_uzemie] || '',
          lv: parseInt(row[columnMapping.lv]) || 0,
          poradie: parseInt(row[columnMapping.poradie]) || 0,
          source_id: 0
        };

        const parsed = parser.parseRecord(rawRecord);
        const systemTags = generateTags(meno_raw);
        
        // Zlúč tagy z oboch parserov
        const advancedTags = parsed.tags_raw || [];
        const merged = mergeTags(advancedTags, systemTags);
        const conflicts = getConflicts(merged);

        processed.push({
          originalIndex: i + 1, // Riadok v CSV (pre debug)
          poradie: row[columnMapping.poradie] || '0',
          katastralne_uzemie: row[columnMapping.katastralne_uzemie] || 'Neznáme',
          lv: row[columnMapping.lv] || '0',
          meno_raw,
          parsed,
          systemTags,
          mergedTags: merged,
          conflicts
        });

        // Update progress každých 1000 riadkov
        if (i % 1000 === 0) {
          setProgress((i / maxRows) * 100);
          // Allow UI to update
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }
      
      setProcessedRows(processed);
      setProgress(100);
      setIsProcessing(false);
    };
    
    reader.readAsText(file, 'UTF-8');
  };

  const copyRowAsJSON = async (row: ProcessedRow) => {
    const jsonData = {
      originalIndex: row.originalIndex,
      poradie: row.poradie,
      katastralne_uzemie: row.katastralne_uzemie,
      lv: row.lv,
      meno_raw: row.meno_raw,
      advancedParser: row.parsed,
      systemTags: row.systemTags,
      mergedTags: row.mergedTags,
      conflicts: row.conflicts
    };
    
    try {
      await navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2));
      setCopySuccess(row.originalIndex);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('Chyba pri kopírovaní:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Modern sticky header */}
      <div className="sticky top-0 z-40">
        {/* Glass effect background */}
        <div className="backdrop-blur-md bg-white/80 dark:bg-gray-900/80 border-b border-gray-200/50 dark:border-gray-700/50">
          {/* Compact header */}
          <div className="px-6 py-3">
            <div className="flex items-center justify-between">
              {/* Left side - title and stats */}
              <div className="flex items-center gap-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                    <FileText className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                      Bulk CSV Parser & Analyzer
                    </h1>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Pokročilý parser pre analýzu CSV súborov
                    </p>
        </div>
      </div>

                {/* Inline compact stats */}
                {stats && (
                  <div className="hidden lg:flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                      <span className="font-medium">{stats.totalRows.toLocaleString('sk-SK')}</span>
                      <span>riadkov</span>
                </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                      <span className="font-medium">{Object.keys(stats.byGender).length}</span>
                      <span>pohlaví</span>
              </div>
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-red-500 rounded-full"></div>
                      <span className="font-medium">{stats.totalConflicts}</span>
                      <span>konfliktov</span>
              </div>
                </div>
                )}
              </div>
              
              {/* Right side - actions */}
              <div className="flex items-center gap-3">
                <ThemeToggle />
              </div>
            </div>
          </div>

          {/* File upload and filters section */}
          <div className="border-t border-gray-200/30 dark:border-gray-700/30">
            <div className="px-6 py-4">
              <div className="flex flex-col lg:flex-row gap-4">
                {/* File upload */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <Upload className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">CSV Súbor:</span>
                  </div>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="text-sm text-gray-500 file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 dark:file:bg-blue-900/30 dark:file:text-blue-400"
                  />
                  <select
                    value={delimiter}
                    onChange={(e) => setDelimiter(e.target.value)}
                    className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                  >
                    <option value=";">; (bodkočiarka)</option>
                    <option value=",">, (čiarka)</option>
                    <option value="\t">Tab</option>
                  </select>
                  {file && !isProcessing && (
                    <button
                      onClick={processFile}
                      className="px-4 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-md transition-colors"
                    >
                      Spracovať
                    </button>
                  )}
                  
                  {processedRows.length > 0 && !isImporting && (
                    <button
                      onClick={importToDatabase}
                      className="px-4 py-1 bg-green-600 hover:bg-green-700 text-white text-sm rounded-md transition-colors flex items-center gap-2"
                    >
                      <Database className="h-4 w-4" />
                      Importovať do DB
                    </button>
                  )}
                  
                  {isImporting && (
                    <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-green-500 border-t-transparent"></div>
                      Importujem...
                    </div>
                  )}
                  
                  {importStatus && (
                    <div className={`text-sm px-3 py-1 rounded ${
                      importStatus.includes('úspešný') 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}>
                      {importStatus}
                    </div>
                  )}
                </div>

                {/* Search and filters */}
                {processedRows.length > 0 && (
                  <div className="flex items-center gap-4 flex-1">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                      <input
                        type="text"
                        placeholder="Hľadať v menách, územiach..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 w-64"
                      />
                    </div>
                    <select
                      value={selectedGender}
                      onChange={(e) => setSelectedGender(e.target.value)}
                      className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                    >
                      <option value="all">Všetky pohlavia</option>
                      <option value="muž">Muž</option>
                      <option value="žena">Žena</option>
                    </select>
                                         {(selectedLV || selectedLVFilter) && (
                       <div className="flex items-center gap-2">
                         <span className="text-sm text-gray-600 dark:text-gray-400">Filter:</span>
                         {selectedLVFilter ? (
                           <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">
                             LV {selectedLVFilter.lv} + Poradie {selectedLVFilter.poradie}
                           </span>
                         ) : (
                           <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">LV {selectedLV}</span>
                         )}
                         <button
                           onClick={() => {
                             setSelectedLV(null);
                             setSelectedLVFilter(null);
                           }}
                           className="text-red-600 hover:text-red-800 text-xs"
                         >
                           ✕
                         </button>
                       </div>
                     )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
              </div>
              
      {/* Main content */}
      <div className="p-6">
        {/* Column mapping */}
        {file && csvHeaders.length > 0 && !isProcessing && processedRows.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <h3 className="text-lg font-semibold mb-4">Mapovanie stĺpcov</h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries({
                katastralne_uzemie: 'Katastrálne územie',
                poradie: 'Poradové číslo',
                lv: 'LV',
                meno: 'Meno vlastníka'
              }).map(([key, label]) => (
                <div key={key}>
                  <label className="block text-sm font-medium mb-2">{label}:</label>
                  <select
                    value={columnMapping[key] || ''}
                    onChange={(e) => setColumnMapping(prev => ({ ...prev, [key]: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800"
                  >
                    <option value="">Vyberte stĺpec...</option>
                    {csvHeaders.map(header => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
        {/* Progress */}
        {isProcessing && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Spracovávanie...</span>
              <span className="text-sm text-gray-600">{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
                  </div>
                </div>
              )}
              
        {/* Results table */}
        {processedRows.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  Výsledky ({sortedAndFilteredRows.length.toLocaleString('sk-SK')} z {processedRows.length.toLocaleString('sk-SK')})
                </h3>
                <div className="flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-gray-600 dark:text-gray-400" />
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    Priemerný score: {stats?.avgParseScore ? (stats.avgParseScore * 100).toFixed(1) + '%' : 'N/A'}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                                 <thead className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-700 dark:to-gray-600 border-b border-gray-200 dark:border-gray-600">
                   <tr>
                     <SortableHeader field="krstne_meno" handleSort={handleSort} sortField={sortField} sortDirection={sortDirection} className="min-w-[200px]">
                       Meno a priezvisko
                     </SortableHeader>
                     <SortableHeader field="katastralne_uzemie" handleSort={handleSort} sortField={sortField} sortDirection={sortDirection} className="min-w-[120px]">
                       Katastrálne územie
                     </SortableHeader>
                     <SortableHeader field="poradie" handleSort={handleSort} sortField={sortField} sortDirection={sortDirection} className="min-w-[80px]">
                       Poradie
                     </SortableHeader>
                     <SortableHeader field="lv" handleSort={handleSort} sortField={sortField} sortDirection={sortDirection} className="min-w-[80px]">
                       LV
                     </SortableHeader>
                     <th className="px-3 py-3 text-left font-semibold min-w-[400px]">
                       Rodinné a ostatné tagy
                     </th>
                     <th className="px-3 py-3 text-left font-semibold min-w-[80px]">
                       Score
                     </th>
                     <th className="px-3 py-3 text-left font-semibold min-w-[120px]">
                       Akcie
                     </th>
                   </tr>
                 </thead>
                                 <tbody className="divide-y divide-gray-100 dark:divide-gray-600">
                   {sortedAndFilteredRows.slice(0, 1000).map((row, index) => {
                     const orderedTags = getOrderedTags(row.mergedTags);
                     const krstneMeno = row.mergedTags.find(t => t.key === 'krstné_meno');
                     const priezvisko = row.mergedTags.find(t => t.key === 'priezvisko');
                     const additionalLVs = getAdditionalLVs(row);
                     const isExpanded = expandedRows.has(row.originalIndex);
                     const hasAdditionalLVs = additionalLVs.length > 0;

                     return (
                       <React.Fragment key={row.originalIndex}>
                         <tr 
                           className={`transition-colors ${hasAdditionalLVs ? 'cursor-pointer hover:bg-blue-50 dark:hover:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                           onClick={() => hasAdditionalLVs && toggleRowExpansion(row.originalIndex)}
                         >
                         {/* Meno a priezvisko s farebným krúžkom pre pohlavie */}
                         <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                           <div className="flex items-center gap-2">
                             {hasAdditionalLVs && (
                               <button
                                 onClick={(e) => {
                                   e.stopPropagation();
                                   toggleRowExpansion(row.originalIndex);
                                 }}
                                 className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                                 title={isExpanded ? "Skryť ďalšie LV" : `Zobraziť ${additionalLVs.length} ďalších LV`}
                               >
                                 {isExpanded ? (
                                   <ChevronDown className="h-3 w-3 text-gray-600" />
                                 ) : (
                                   <ChevronRight className="h-3 w-3 text-gray-600" />
                                 )}
                               </button>
                             )}
                             <div className={`w-2 h-2 rounded-full ${getGenderColor(row.parsed.gender)}`} title={row.parsed.gender || 'neznáme'}></div>
                             <div className="cursor-help" title={`Pôvodný text: "${row.meno_raw}"`}>
                               {krstneMeno && priezvisko ? (
                                 <span className="font-medium text-gray-900 dark:text-gray-100">
                                   {krstneMeno.value} {priezvisko.value}
                                 </span>
                               ) : krstneMeno ? (
                                 <span className="font-medium text-gray-900 dark:text-gray-100">
                                   {krstneMeno.value}
                                 </span>
                               ) : priezvisko ? (
                                 <span className="font-medium text-gray-900 dark:text-gray-100">
                                   {priezvisko.value}
                                 </span>
                               ) : (
                                 <span className="text-gray-400 italic">-</span>
                               )}
          </div>
        </div>
                         </td>
                         
                         {/* Katastrálne územie */}
                         <td className="px-3 py-3 text-gray-700 dark:text-gray-300">
                           {row.katastralne_uzemie}
                         </td>
                         
                         {/* Poradové číslo z CSV */}
                         <td className="px-3 py-3 text-gray-600 font-medium">
                           {row.poradie}
                         </td>
                         
                         {/* LV */}
                         <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                           <button
                             onClick={(e) => {
                               e.stopPropagation();
                               const isCurrentlySelected = selectedLVFilter?.lv === row.lv && selectedLVFilter?.poradie === row.poradie;
                               if (isCurrentlySelected) {
                                 setSelectedLVFilter(null);
                                 setSelectedLV(null);
                               } else {
                                 setSelectedLVFilter({ lv: row.lv, poradie: row.poradie });
                                 setSelectedLV(null);
                               }
                             }}
                             className={`font-mono text-sm px-2 py-1 rounded transition-colors ${
                               (selectedLVFilter?.lv === row.lv && selectedLVFilter?.poradie === row.poradie) || selectedLV === row.lv
                                 ? 'bg-purple-100 text-purple-800 font-bold' 
                                 : 'text-blue-600 hover:bg-blue-50'
                             }`}
                             title={`LV číslo: ${row.lv}, Poradie: ${row.poradie} - kliknite pre filtrovanie rovnakých LV+Poradie`}
                           >
                             {row.lv}
                           </button>
                         </td>
                         
                         {/* Rodinné a ostatné tagy */}
                         <td className="px-3 py-3">
                           <div className="flex flex-wrap gap-1">
                             {orderedTags.map((tag, tagIndex) => (
                               <span
                                 key={tagIndex}
                                 className={`px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                                   tag.source === 'advanced' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                   tag.source === 'system' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                   'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                                 } ${tag.conflict ? 'ring-2 ring-red-300' : ''}`}
                                 title={`${formatTagName(tag.key)}: ${tag.value} (${(tag.confidence * 100).toFixed(0)}% ${tag.source.toUpperCase()})${tag.conflict ? '\n⚠️ KONFLIKT: ' + tag.reasoning : ''}`}
                               >
                                 {tag.conflict && '⚠️ '}
                                 <strong>{formatTagName(tag.key)}:</strong> {tag.value}
                               </span>
                             ))}
                             {orderedTags.length === 0 && (
                               <span className="text-gray-400 italic text-xs">Žiadne ďalšie tagy</span>
      )}
    </div>
                         </td>
                         
                         {/* Score */}
                         <td className="px-3 py-3">
                           <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                             row.parsed.parse_score >= 0.8 ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                             row.parsed.parse_score >= 0.6 ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200' :
                             'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
                           }`}>
                             {(row.parsed.parse_score * 100).toFixed(0)}%
        </span>
                         </td>
                         
                         {/* Akcie */}
                         <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                           <div className="flex items-center gap-1">
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 openLVPdf(row.lv, row.poradie);
                               }}
                               className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
                               title="Otvoriť LV PDF"
                             >
                               <FileDown className="h-3 w-3" />
                             </button>
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 openZGBIS(row.lv, row.poradie);
                               }}
                               className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors"
                               title="Otvoriť v ZBGIS katastri"
                             >
                               <MapIcon className="h-3 w-3" />
                             </button>
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 openGoogleMaps(row.katastralne_uzemie);
                               }}
                               className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
                               title="Otvoriť v Google Maps"
                             >
                               <MapPin className="h-3 w-3" />
                             </button>
                             <button
                               onClick={(e) => {
                                 e.stopPropagation();
                                 copyRowAsJSON(row);
                               }}
                               className={`p-1 rounded transition-colors ${
                                 copySuccess === row.originalIndex
                                   ? 'text-green-600 bg-green-50'
                                   : 'text-gray-600 hover:bg-gray-50'
                               }`}
                               title="Kopírovať JSON dáta riadku"
                             >
                               {copySuccess === row.originalIndex ? '✓' : '📋'}
                             </button>
                           </div>
                         </td>
                       </tr>

                       {/* Expanded row pre ďalšie LV */}
                       {isExpanded && additionalLVs.length > 0 && (
                         <tr className="bg-blue-50 dark:bg-blue-900/10">
                           <td colSpan={7} className="px-3 py-3">
                             <div className="pl-6">
                               <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                 Ďalšie LV pre {krstneMeno?.value} {priezvisko?.value} v obci {row.katastralne_uzemie}:
                               </h4>
                               <div className="flex flex-wrap gap-2">
                                 {additionalLVs.map((lvData, lvIndex) => (
                                   <button
                                     key={lvIndex}
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       setSelectedLVFilter({ lv: lvData.lv, poradie: lvData.poradie });
                                       setSelectedLV(null);
                                     }}
                                     className="px-3 py-1 bg-blue-100 hover:bg-blue-200 text-blue-800 rounded-full text-sm font-mono transition-colors"
                                     title={`LV ${lvData.lv}, Poradie ${lvData.poradie} - kliknite pre filtrovanie`}
                                   >
                                     LV {lvData.lv} (P.č. {lvData.poradie})
                                   </button>
                                 ))}
                               </div>
                             </div>
                           </td>
                         </tr>
                       )}
                     </React.Fragment>
                     );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
