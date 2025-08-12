'use client';

import { useState, useMemo } from 'react';
import Papa from 'papaparse';
import { AdvancedParser } from '@/lib/parser/advanced-parser';
import { ParsedRecord, RawRecord } from '@/lib/parser/types';
import { generateTags } from '@/lib/normalize';
import { mergeTags, MergedTag, getConflicts } from '@/lib/parser/tag-merger';

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

  const copyRowAsJSON = async (row: ProcessedRow) => {
    const jsonData = {
      originalIndex: row.originalIndex,
      meno_raw: row.meno_raw,
      advancedParser: {
        parse_score: row.parsed.parse_score,
        gender: row.parsed.gender,
        is_spf: row.parsed.is_spf,
        spf_conf: row.parsed.spf_conf,
        parse_errors: row.parsed.parse_errors,
        given: row.parsed.given,
        surname: row.parsed.surname,
        maiden_surname: row.parsed.maiden_surname,
        spouse_given: row.parsed.spouse_given,
        spouse_surname: row.parsed.spouse_surname,
        status: row.parsed.status,
        origin_place: row.parsed.origin_place,
        residence: row.parsed.residence,
        birth_place: row.parsed.birth_place,
        birth_date: row.parsed.birth_date,
        death_date: row.parsed.death_date,
        name_suffix: row.parsed.name_suffix,
        name_suffix_roman: row.parsed.name_suffix_roman,
        meno_clean: row.parsed.meno_clean,
        evidence_spans: row.parsed.evidence_spans,
        notes_raw: row.parsed.notes_raw,
        tags_raw: row.parsed.tags_raw
      },
      systemTags: row.systemTags
    };

    try {
      await navigator.clipboard.writeText(JSON.stringify(jsonData, null, 2));
      setCopySuccess(row.originalIndex);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const analyzeFamilyRelations = async () => {
    if (!lastSourceId) return;
    
    setIsAnalyzingFamily(true);
    try {
      const response = await fetch('/api/family-relations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sourceId: lastSourceId }),
      });

      if (response.ok) {
        const data = await response.json();
        setFamilyRelations(data);
      } else {
        console.error('Failed to analyze family relations');
      }
    } catch (error) {
      console.error('Error analyzing family relations:', error);
    } finally {
      setIsAnalyzingFamily(false);
    }
  };

  // Všetky možné tag typy z parsera
  const allPossibleTags = [
    'given', 'surname', 'maiden_surname', 'spouse_given', 'spouse_surname',
    'status', 'origin_place', 'residence', 'birth_place', 'birth_date', 
    'death_date', 'name_suffix', 'name_suffix_roman'
  ];

  // Systémové tagy z pôvodného parsera
  const systemTagTypes = [
    'krstné_meno', 'priezvisko', 'rodné_priezvisko', 'manželka', 'manžel', 'manželka_rodné',
    'otec', 'matka', 'syn', 'dcéra', '✝️', 'maloletý', 'vdova', 'adresa'
  ];

  // Definované poradie tagov pre konzistentné zobrazenie
  const tagDisplayOrder = [
    'rodné_priezvisko', 'manželka', 'manžel', 'manželka_rodné', 
    'otec', 'matka', 'syn', 'dcéra', 
    'adresa', '✝️', 'maloletý', 'vdova'
  ];

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setProcessedRows([]);
      
      // Načítanie prvých riadkov pre detekciu stĺpcov
      const reader = new FileReader();
      reader.onload = (e) => {
        const csvText = e.target?.result as string;
        const preview = Papa.parse(csvText, {
          header: true,
          delimiter,
          preview: 5,
          skipEmptyLines: true,
          transformHeader: (header: string) => header.trim()
        });
        
        if (preview.data.length > 0) {
          const headers = Object.keys(preview.data[0] as any);
          setCsvHeaders(headers);
          
          // Auto-mapovanie
          const mapping: {[key: string]: string} = {};
          headers.forEach(header => {
            const lowerHeader = header.toLowerCase();
            if (lowerHeader.includes('katastrálne') || lowerHeader.includes('územie')) {
              mapping.katastralne_uzemie = header;
            } else if (lowerHeader.includes('poradové') || lowerHeader.includes('poradie')) {
              mapping.poradie = header;
            } else if (lowerHeader === 'lv') {
              mapping.lv = header;
            } else if (lowerHeader.includes('meno') || lowerHeader.includes('vlastník')) {
              mapping.meno = header;
            }
          });
          setColumnMapping(mapping);
        }
      };
      reader.readAsText(selectedFile, 'UTF-8');
    }
  };

  const handleProcess = async () => {
    if (!file || !columnMapping.meno) return;

    setIsProcessing(true);
    setProgress(0);

    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvText = e.target?.result as string;
      
      const parseResult = Papa.parse(csvText, {
        header: true,
        delimiter,
        skipEmptyLines: true,
        transformHeader: (header: string) => header.trim()
      });

      const rows = parseResult.data as any[];
      const maxRows = Math.min(rows.length, 100000); // Limit na 100k
      const processed: ProcessedRow[] = [];

      // Reset family relations keď načítavame nové dáta
      setFamilyRelations(null);
      setLastSourceId(null);
      setSelectedLV(null);

      for (let i = 0; i < maxRows; i++) {
        const row = rows[i];
        const meno_raw = row[columnMapping.meno]?.trim();
        
        if (meno_raw) {
          const rawRecord: RawRecord = {
            k_uzemie: row[columnMapping.katastralne_uzemie] || 'Neznáme',
            poradie: row[columnMapping.poradie] || '0',
            lv: row[columnMapping.lv] || '0',
            meno_raw
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
        }

        // Update progress každých 1000 riadkov
        if (i % 1000 === 0) {
          setProgress((i / maxRows) * 100);
          // Malé oneskorenie pre UI update
          await new Promise(resolve => setTimeout(resolve, 1));
        }
      }

      setProcessedRows(processed);
      setProgress(100);
      setIsProcessing(false);
    };

    reader.readAsText(file, 'UTF-8');
  };

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
    
    const tagStats = allPossibleTags.reduce((acc, tag) => {
      acc[tag] = processedRows.filter(row => (row.parsed as any)[tag]?.value).length;
      return acc;
    }, {} as {[key: string]: number});

    const systemTagStats = systemTagTypes.reduce((acc, tagType) => {
      acc[tagType] = processedRows.filter(row => 
        row.systemTags.some(tag => tag.key === tagType)
      ).length;
      return acc;
    }, {} as {[key: string]: number});

    return {
      totalRows,
      byGender,
      avgParseScore,
      spfCount,
      tagStats,
      totalConflicts,
      conflictRate,
      systemTagStats
    };
  }, [processedRows]);

  // Sortované a filtrované dáta
  const sortedAndFilteredRows = useMemo(() => {
    let filtered = processedRows.filter(row => selectedLV ? row.lv === selectedLV : true);
    
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
  }, [processedRows, selectedLV, sortField, sortDirection, getSortValue]);

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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Bulk CSV Parser & Analyzer</h1>
      
      {/* File Upload sekcia */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
        <h3 className="text-lg font-semibold mb-3">CSV Upload</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-2">CSV Súbor:</label>
          <input
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
        </div>
        
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-2">Delimiter:</label>
              <select
                value={delimiter}
                onChange={(e) => setDelimiter(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
              >
                <option value=";">Bodkočiarka (;)</option>
                <option value=",">Čiarka (,)</option>
                <option value="\t">Tab</option>
              </select>
      </div>

            {csvHeaders.length > 0 && (
              <div>
                <label className="block text-sm font-medium mb-2">Stĺpec s menom:</label>
                <select
                  value={columnMapping.meno || ''}
                  onChange={(e) => setColumnMapping({...columnMapping, meno: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700"
                >
                  <option value="">Vyberte stĺpec...</option>
                  {csvHeaders.map(header => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {file && (
            <div className="flex items-center gap-4">
              <button
                onClick={handleProcess}
                disabled={isProcessing || !columnMapping.meno}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-md transition-colors"
              >
                {isProcessing ? 'Spracovávam...' : 'Spracovať CSV'}
              </button>
              
              {isProcessing && (
                <div className="flex items-center gap-2">
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${progress}%` }}
                    />
              </div>
                  <span className="text-sm text-gray-600">{progress.toFixed(1)}%</span>
                </div>
              )}
              </div>
          )}
                </div>
              </div>

      {/* Štatistiky */}
      {stats && (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-lg font-semibold">Štatistiky</h3>
            <div className="flex gap-2 items-center">
              <input
                type="number"
                placeholder="Source ID"
                value={lastSourceId || ''}
                onChange={(e) => setLastSourceId(e.target.value ? parseInt(e.target.value) : null)}
                className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm w-24"
              />
              <button
                onClick={analyzeFamilyRelations}
                disabled={isAnalyzingFamily || !lastSourceId}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white rounded-md transition-colors text-sm"
              >
                {isAnalyzingFamily ? 'Analyzujem...' : '🔍 Rodinné väzby'}
              </button>
              <button
                onClick={() => setLastSourceId(999)}
                className="px-2 py-1 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded text-xs"
              >
                Demo (999)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.totalRows.toLocaleString()}</div>
              <div className="text-sm text-gray-600">Celkom riadkov</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{(stats.avgParseScore * 100).toFixed(1)}%</div>
              <div className="text-sm text-gray-600">Priemerný parse score</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.spfCount.toLocaleString()}</div>
              <div className="text-sm text-gray-600">SPF záznamy</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.totalConflicts}</div>
              <div className="text-sm text-gray-600">Konflikty ({stats.conflictRate.toFixed(1)}%)</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
              <h4 className="font-medium mb-2">Rozdelenie podľa pohlavia:</h4>
              {Object.entries(stats.byGender).map(([gender, count]) => (
                <div key={gender} className="flex justify-between text-sm">
                  <span>{gender}:</span>
                  <span className="font-medium">{count.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
              
                <div>
              <h4 className="font-medium mb-2">🔵 Pokročilé tagy (AdvancedParser):</h4>
              {Object.entries(stats.tagStats)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .map(([tag, count]) => (
                  <div key={tag} className="flex justify-between text-sm">
                    <span>{tag}:</span>
                    <span className="font-medium">{count.toLocaleString()}</span>
                  </div>
                ))}
                </div>
              
                <div>
              <h4 className="font-medium mb-2">🟢 Systémové tagy (generateTags):</h4>
              {Object.entries(stats.systemTagStats)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .map(([tag, count]) => (
                  <div key={tag} className="flex justify-between text-sm">
                    <span>{tag}:</span>
                    <span className="font-medium">{count.toLocaleString()}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Rodinné väzby */}
      {familyRelations && (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 mb-6">
          <h3 className="text-lg font-semibold mb-3">
            🏠 Rodinné väzby (Source ID: {familyRelations.sourceId})
          </h3>
          
          <div className="mb-4">
            <div className="text-sm text-gray-600">
              Nájdených {familyRelations.totalLvGroups} LV skupín s viacerými osobami
            </div>
          </div>

          <div className="space-y-4 max-h-96 overflow-y-auto">
            {familyRelations.familyRelations.map((family: any, index: number) => (
              <div key={index} className="border border-gray-200 dark:border-gray-600 rounded-lg p-3">
                <div className="mb-2">
                  <span className="font-medium">
                    LV {family.lvGroup.lv} • {family.lvGroup.katastralne_uzemie}
                  </span>
                  <span className="ml-2 text-sm text-gray-600">
                    ({family.lvGroup.memberCount} osôb)
                  </span>
                  {family.lvGroup.poradoveCisla && (
                    <span className="ml-2 text-xs text-blue-600 font-mono">
                      P.č.: {family.lvGroup.poradoveCisla.join(', ')}
                    </span>
                  )}
                </div>

                {/* Členovia */}
                <div className="mb-3">
                  <div className="text-sm font-medium mb-1">Členovia:</div>
                  <div className="flex flex-wrap gap-2">
                    {family.members.map((member: any) => (
                      <span
                        key={member.id}
                        className={`px-2 py-1 text-xs rounded ${
                          member.gender === 'muž' 
                            ? 'bg-blue-100 text-blue-800' 
                            : member.gender === 'žena'
                            ? 'bg-pink-100 text-pink-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {member.meno_raw} ({member.poradie})
                      </span>
                    ))}
                  </div>
                </div>

                {/* Detegované väzby */}
                {family.detectedRelations.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-1">Detegované väzby:</div>
                    <div className="space-y-1">
                      {family.detectedRelations.map((relation: any, relIndex: number) => {
                        const person1 = family.members.find((m: any) => m.id === relation.person1);
                        const person2 = family.members.find((m: any) => m.id === relation.person2);
                        
                        return (
                          <div key={relIndex} className="text-xs bg-gray-50 dark:bg-gray-700 p-2 rounded">
                            <div className="font-medium">
                              {person1?.meno_raw} ↔ {person2?.meno_raw}
                            </div>
                            <div className="text-gray-600">
                              <span className={`px-1 rounded ${getRelationColor(relation.relation)}`}>
                                {relation.relation}
                              </span>
                              <span className="ml-2">
                                {(relation.confidence * 100).toFixed(0)}% istota
                              </span>
                            </div>
                            {relation.evidence.length > 0 && (
                              <div className="mt-1 text-gray-500">
                                💡 {relation.evidence[0]}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}
            </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabuľka výsledkov */}
      {processedRows.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold">Výsledky parsingu</h3>
            <div className="flex justify-between items-center">
              <p className="text-sm text-gray-600">
                {selectedLV 
                  ? `Filtrované: LV ${selectedLV} (${processedRows.filter(row => row.lv === selectedLV).length} záznamov)`
                  : `Zobrazuje prvých ${Math.min(processedRows.length, 1000)} záznamov`
                }
              </p>
              {selectedLV && (
                <button
                  onClick={() => setSelectedLV(null)}
                  className="px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded"
                >
                  ✕ Zrušiť filter
                </button>
              )}
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
                  // Zozbierať všetky tagy do jedného zoznamu
                  const allTags: Array<{name: string, value: string, source: 'ADV' | 'SYS', uncertain?: boolean, confidence?: number}> = [];
                  
                  // AdvancedParser tagy
                  allPossibleTags.forEach(tag => {
                    const field = (row.parsed as any)[tag];
                    if (field?.value) {
                      allTags.push({
                        name: tag.replace('_', ' '),
                        value: field.value,
                        source: 'ADV',
                        uncertain: field.uncertain,
                        confidence: field.confidence
                      });
                    }
                  });

                  // Systémové tagy
                  row.systemTags.forEach(systemTag => {
                    allTags.push({
                      name: systemTag.key,
                      value: systemTag.value,
                      source: 'SYS',
                      uncertain: systemTag.uncertain
                    });
                  });

                  // Pridať základné info
                  if (row.parsed.gender && row.parsed.gender !== 'neznáme') {
                    allTags.unshift({
                      name: 'pohlavie',
                      value: row.parsed.gender,
                      source: 'ADV'
                    });
                  }

                  if (row.parsed.is_spf) {
                    allTags.unshift({
                      name: 'SPF',
                      value: 'áno',
                      source: 'ADV'
                    });
                  }

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
  );
}