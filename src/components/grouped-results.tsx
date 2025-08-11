'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, ChevronLeft, Users, MapPin, ExternalLink, Search } from 'lucide-react';
import type { SearchResult } from '@/lib/db';
import { TagChip } from './tag-chip';
import { RecordDetail } from './record-detail';
import { createGoogleSearchUrl, createGoogleSearchDescription, isGoogleSearchAvailable } from '@/lib/google-search';

interface LvGroup {
  katastralne_uzemie: string;
  lv: number;
  poradie: number;
  records: SearchResult[];
  totalCount: number;
}

interface GroupedResultsProps {
  results: SearchResult[];
  loading?: boolean;
  onTagClick?: (value: string) => void;
  onSearch?: (query: string) => void;
  pagination?: {
    currentPage: number;
    totalPages: number;
    onPrevious: () => void;
    onNext: () => void;
    canPrevious: boolean;
    canNext: boolean;
  };
}

export function GroupedResults({ results, loading, onTagClick, onSearch, pagination }: GroupedResultsProps) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedRecords, setExpandedRecords] = useState<Set<number>>(new Set());

  // Zoskupenie výsledkov podľa LV
  const groupedResults = results.reduce((groups: Record<string, LvGroup>, result) => {
    const key = `${result.katastralne_uzemie}-${result.lv}`;
    
    if (!groups[key]) {
      groups[key] = {
        katastralne_uzemie: result.katastralne_uzemie,
        lv: result.lv,
        poradie: result.poradie,
        records: [],
        totalCount: 0
      };
    }
    
    groups[key].records.push(result);
    groups[key].totalCount++;
    
    return groups;
  }, {});

  const groupKeys = Object.keys(groupedResults).sort((a, b) => {
    const groupA = groupedResults[a];
    const groupB = groupedResults[b];
    // Zoradenie podľa katastrálneho územia a potom LV
    if (groupA.katastralne_uzemie !== groupB.katastralne_uzemie) {
      return groupA.katastralne_uzemie.localeCompare(groupB.katastralne_uzemie);
    }
    return groupA.lv - groupB.lv;
  });

  const toggleGroup = (groupKey: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupKey)) {
        newSet.delete(groupKey);
      } else {
        newSet.add(groupKey);
      }
      return newSet;
    });
  };

  const toggleRecordDetail = (recordId: number) => {
    setExpandedRecords(prev => {
      const newSet = new Set(prev);
      if (newSet.has(recordId)) {
        newSet.delete(recordId);
      } else {
        newSet.add(recordId);
      }
      return newSet;
    });
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
        <div className="animate-pulse p-6">
          <div className="space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
                <div className="ml-4 space-y-2">
                  {[...Array(2)].map((_, j) => (
                    <div key={j} className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-full"></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (groupKeys.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          Neboli nájdené žiadne výsledky.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
            Výsledky zoskupené podľa LV
          </h3>
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {groupKeys.length} {groupKeys.length === 1 ? 'skupina' : groupKeys.length < 5 ? 'skupiny' : 'skupín'}
          </div>
        </div>
      </div>

      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {groupKeys.map((groupKey) => {
          const group = groupedResults[groupKey];
          const isExpanded = expandedGroups.has(groupKey);

          return (
            <div key={groupKey} className="overflow-hidden">
              {/* Hlavička skupiny */}
              <button
                onClick={() => toggleGroup(groupKey)}
                className="w-full px-6 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isExpanded ? (
                      <ChevronDown className="h-5 w-5 text-gray-500" />
                    ) : (
                      <ChevronRight className="h-5 w-5 text-gray-500" />
                    )}
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-blue-600" />
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {group.katastralne_uzemie}
                      </span>
                    </div>
                    <div className="bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-1 rounded text-sm font-medium">
                      LV {group.lv}
                    </div>
                    <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
                      <Users className="h-4 w-4" />
                      <span className="text-sm">
                        {group.totalCount} {group.totalCount === 1 ? 'osoba' : group.totalCount < 5 ? 'osoby' : 'osôb'}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* Kataster link pre LV */}
                    <a
                      href={`https://kataster.skgeodesy.sk/Portal45/api/Bo/GeneratePrfPublic/?cadastralUnitCode=${group.poradie}&prfNumber=${group.lv}&outputType=pdf`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 rounded transition-colors"
                      title={`Zobraziť v katastri: LV ${group.lv}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink className="h-3 w-3" />
                      PDF
                    </a>
                  </div>
                </div>
              </button>

              {/* Rozbalený obsah skupiny */}
              {isExpanded && (
                <div className="bg-gray-50 dark:bg-gray-800/50 border-t border-gray-200 dark:border-gray-700">
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {group.records.map((record) => (
                      <div key={record.id}>
                        {/* Záznam osoby */}
                        <div 
                          className={`px-8 py-3 cursor-pointer transition-all duration-200 ${
                            expandedRecords.has(record.id)
                              ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-l-blue-500'
                              : 'hover:bg-white dark:hover:bg-gray-700 border-l-4 border-l-transparent hover:border-l-gray-300 dark:hover:border-l-gray-600'
                          }`}
                          onClick={() => toggleRecordDetail(record.id)}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3">
                                <span className="text-sm font-mono text-gray-600 dark:text-gray-400">
                                  #{record.poradie}
                                </span>
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                  {record.meno_raw}
                                </span>
                                {/* Tagy (okrem mena) */}
                                {(() => {
                                  const nonNameTags = record.tags?.filter(tag => tag.key !== 'meno') || [];
                                  return nonNameTags.length > 0 && (
                                    <div className="flex flex-wrap gap-1">
                                      {nonNameTags.slice(0, 3).map((tag, tagIndex) => (
                                        <TagChip
                                          key={`${record.id}-${tag.key}-${tagIndex}`}
                                          tag={tag}
                                          onClick={(value) => {
                                            onTagClick?.(value);
                                          }}
                                          size="sm"
                                        />
                                      ))}
                                      {nonNameTags.length > 3 && (
                                        <span className="text-xs text-gray-500 dark:text-gray-400">
                                          +{nonNameTags.length - 3}
                                        </span>
                                      )}
                                    </div>
                                  );
                                })()}
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-2 ml-2">
                              {/* Google search pre osobu */}
                              {(() => {
                                const googleUrl = createGoogleSearchUrl(record.meno_raw, record.katastralne_uzemie);
                                const isAvailable = isGoogleSearchAvailable(record.meno_raw);
                                const description = createGoogleSearchDescription(record.meno_raw, record.katastralne_uzemie);
                                
                                return isAvailable && googleUrl ? (
                                  <a
                                    href={googleUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300 bg-green-50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40 rounded transition-colors"
                                    title={description}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <Search className="h-3 w-3" />
                                  </a>
                                ) : null;
                              })()}
                              
                              {/* Expand indikátor */}
                              <div className={`p-1 rounded-full transition-all duration-200 ${
                                expandedRecords.has(record.id)
                                  ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300'
                                  : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600 hover:text-gray-600 dark:hover:text-gray-300'
                              }`}>
                                {expandedRecords.has(record.id) ? (
                                  <ChevronDown className="h-4 w-4" />
                                ) : (
                                  <ChevronRight className="h-4 w-4" />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Detail záznamu */}
                        <RecordDetail
                          record={record}
                          isOpen={expandedRecords.has(record.id)}
                          onToggle={() => toggleRecordDetail(record.id)}
                          onSearch={onSearch}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {pagination && (
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-700 dark:text-gray-300">
              Strana {pagination.currentPage} / {pagination.totalPages}
            </div>
            <div className="flex gap-2">
              <button
                onClick={pagination.onPrevious}
                disabled={!pagination.canPrevious}
                className="px-3 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                <ChevronLeft className="h-4 w-4" />
                Predchádzajúca
              </button>
              <button
                onClick={pagination.onNext}
                disabled={!pagination.canNext}
                className="px-3 py-1 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
              >
                Ďalšia
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
