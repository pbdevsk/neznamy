'use client';

import { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { AdvancedParser } from '@/lib/parser/advanced-parser';
import { ParsedRecord, RawRecord } from '@/lib/parser/types';
import { generateTags } from '@/lib/normalize';
import { mergeTags, MergedTag, getConflicts } from '@/lib/parser/tag-merger';
import { ThemeToggle } from '@/components/theme-toggle';
import { Database, Upload, FileText, BarChart3, Filter, Download } from 'lucide-react';

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

export function AdvancedParserDemo() {
  const [file, setFile] = useState<File | null>(null);
  const [delimiter, setDelimiter] = useState<string>(';');
  const [columnMapping, setColumnMapping] = useState<{[key: string]: string}>({});
  const [processedRows, setProcessedRows] = useState<ProcessedRow[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
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

  // Funkcia na získanie tagov v správnom poradí
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

  // Sortované a filtrované dáta
  const sortedAndFilteredRows = useMemo(() => {
    let filtered = processedRows.filter(row => {
      // LV filter
      if (selectedLV && row.lv !== selectedLV) return false;
      
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
  }, [processedRows, selectedLV, selectedGender, searchQuery, sortField, sortDirection]);

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
                    {selectedLV && (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600 dark:text-gray-400">LV filter:</span>
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">{selectedLV}</span>
                        <button
                          onClick={() => setSelectedLV(null)}
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
                    <SortableHeader field="poradie" handleSort={handleSort} sortField={sortField} sortDirection={sortDirection} className="min-w-[80px]">
                      Poradie
                    </SortableHeader>
                    <SortableHeader field="katastralne_uzemie" handleSort={handleSort} sortField={sortField} sortDirection={sortDirection} className="min-w-[120px]">
                      Katastrálne územie
                    </SortableHeader>
                    <SortableHeader field="lv" handleSort={handleSort} sortField={sortField} sortDirection={sortDirection} className="min-w-[80px]">
                      LV
                    </SortableHeader>
                    <SortableHeader field="krstne_meno" handleSort={handleSort} sortField={sortField} sortDirection={sortDirection} className="min-w-[120px]">
                      Meno
                    </SortableHeader>
                    <SortableHeader field="priezvisko" handleSort={handleSort} sortField={sortField} sortDirection={sortDirection} className="min-w-[120px]">
                      Priezvisko
                    </SortableHeader>
                    <SortableHeader field="pohlavie" handleSort={handleSort} sortField={sortField} sortDirection={sortDirection} className="min-w-[80px]">
                      Pohlavie
                    </SortableHeader>
                    <th className="px-3 py-3 text-left font-semibold min-w-[300px]">
                      Pôvodný text
                    </th>
                    <th className="px-3 py-3 text-left font-semibold min-w-[400px]">
                      Rodinné a ostatné tagy
                    </th>
                    <th className="px-3 py-3 text-left font-semibold min-w-[80px]">
                      Score
                    </th>
                    <th className="px-3 py-3 text-left font-semibold min-w-[80px]">
                      JSON
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-600">
                  {sortedAndFilteredRows.slice(0, 1000).map((row) => {
                    const orderedTags = getOrderedTags(row.mergedTags);
                    const krstneMeno = row.mergedTags.find(t => t.key === 'krstné_meno');
                    const priezvisko = row.mergedTags.find(t => t.key === 'priezvisko');

                    return (
                      <tr key={row.originalIndex} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        {/* Poradové číslo z CSV */}
                        <td className="px-3 py-3 text-gray-600 font-medium">
                          {row.poradie}
                        </td>
                        
                        {/* Katastrálne územie */}
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">
                          {row.katastralne_uzemie}
                        </td>
                        
                        {/* LV */}
                        <td className="px-3 py-3">
                          <button
                            onClick={() => setSelectedLV(selectedLV === row.lv ? null : row.lv)}
                            className={`font-mono text-sm px-2 py-1 rounded transition-colors ${
                              selectedLV === row.lv 
                                ? 'bg-blue-100 text-blue-800 font-bold' 
                                : 'text-blue-600 hover:bg-blue-50'
                            }`}
                            title={`LV číslo: ${row.lv} - kliknite pre filtrovanie`}
                          >
                            {row.lv}
                          </button>
                        </td>
                        
                        {/* Meno */}
                        <td className="px-3 py-3">
                          {krstneMeno ? (
                            <span 
                              className="font-medium text-gray-900 dark:text-gray-100"
                              title={`${formatTagName(krstneMeno.key)}: ${krstneMeno.value} (${(krstneMeno.confidence * 100).toFixed(0)}% ${krstneMeno.source.toUpperCase()})`}
                            >
                              {krstneMeno.value}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic">-</span>
                          )}
                        </td>
                        
                        {/* Priezvisko */}
                        <td className="px-3 py-3">
                          {priezvisko ? (
                            <span 
                              className="font-medium text-gray-900 dark:text-gray-100"
                              title={`${formatTagName(priezvisko.key)}: ${priezvisko.value} (${(priezvisko.confidence * 100).toFixed(0)}% ${priezvisko.source.toUpperCase()})`}
                            >
                              {priezvisko.value}
                            </span>
                          ) : (
                            <span className="text-gray-400 italic">-</span>
                          )}
                        </td>
                        
                        {/* Pohlavie */}
                        <td className="px-3 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                            row.parsed.gender === 'muž' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                            row.parsed.gender === 'žena' ? 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200' :
                            'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                          }`}>
                            {row.parsed.gender || '?'}
                          </span>
                        </td>
                        
                        {/* Pôvodný text */}
                        <td className="px-3 py-3">
                          <div className="text-sm text-gray-700 dark:text-gray-300 italic max-w-xs overflow-hidden text-ellipsis">
                            {row.meno_raw}
                          </div>
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
                        
                        {/* JSON */}
                        <td className="px-3 py-3">
                          <button
                            onClick={() => copyRowAsJSON(row)}
                            className={`px-3 py-1 text-xs rounded-md transition-colors font-medium ${
                              copySuccess === row.originalIndex
                                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                : 'bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300'
                            }`}
                            title="Kopírovať JSON dáta riadku"
                          >
                            {copySuccess === row.originalIndex ? '✓' : '📋'}
                          </button>
                        </td>
                      </tr>
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
