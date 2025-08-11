'use client';

import { ExternalLink, ChevronDown, ChevronUp, Search, MapPin, Map } from 'lucide-react';
import { useState } from 'react';
import type { SearchResult } from '@/lib/db';
import { TagChip } from './tag-chip';
import { RecordDetail } from './record-detail';
import { Pagination } from './pagination';
import { createGoogleSearchUrl, createGoogleSearchDescription, isGoogleSearchAvailable } from '@/lib/google-search';
import { createGoogleMapsUrl, createZbgisUrl, createZbgisLvUrl, isGoogleMapsAvailable, createGoogleMapsDescription, createZbgisDescription, createZbgisLvDescription } from '@/lib/map-utils';
import { useBatchGeocoding } from '@/hooks/use-geocoding';

interface ResultsTableProps {
  results: SearchResult[];
  loading?: boolean;
  onTagClick?: (value: string) => void;
  onSearch?: (query: string) => void;
  pagination?: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    onPrevious: () => void;
    onNext: () => void;
    canPrevious: boolean;
    canNext: boolean;
    pageSize: number;
    onPageSizeChange: (size: number) => void;
    totalResults?: number;
  };
}

export function ResultsTable({ results, loading, onTagClick, onSearch, pagination }: ResultsTableProps) {
  const [expandedRecords, setExpandedRecords] = useState<Set<number>>(new Set());
  
  // Batch geocoding pre všetky lokality v tabuľke
  const localities = results.map(r => r.katastralne_uzemie);
  const geocodingResults = useBatchGeocoding(localities);

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
            {[...Array(5)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="flex gap-4">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded flex-1"></div>
                </div>
                <div className="flex gap-2">
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-16"></div>
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-20"></div>
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded-full w-12"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
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
      {/* Hlavička tabuľky */}
      <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-3">
        <div className="grid grid-cols-10 gap-4 text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
          <div className="col-span-4">Meno & tagy</div>
          <div className="col-span-3">Katastrálne územie</div>
          <div className="col-span-1">Poradie</div>
          <div className="col-span-1">LV</div>
          <div className="col-span-1">Akcie</div>
        </div>
      </div>

      {/* Riadky tabuľky */}
      <div className="divide-y divide-gray-200 dark:divide-gray-700">
        {results.map((result, index) => (
          <div key={result.id}>
            {/* Hlavný riadok - klikateľný */}
            <div 
              className={`px-6 py-4 cursor-pointer transition-all duration-200 border-l-4 ${
                expandedRecords.has(result.id)
                  ? 'bg-blue-50 dark:bg-blue-900/20 border-l-blue-500 shadow-sm'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-700 border-l-transparent hover:border-l-gray-300 dark:hover:border-l-gray-600'
              }`}
              onClick={() => toggleRecordDetail(result.id)}
            >
              <div className="grid grid-cols-10 gap-4">
                {/* Meno & tagy */}
                <div className="col-span-4 space-y-2">
                  {/* Meno */}
                  <div className="text-sm text-gray-900 dark:text-gray-100 font-medium">
                    {result.meno_raw}
                  </div>

                  {/* Tagy (okrem mena) */}
                  {(() => {
                    const nonNameTags = result.tags.filter(tag => tag.key !== 'meno');
                    return nonNameTags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {nonNameTags.map((tag, tagIndex) => (
                          <TagChip
                            key={`${result.id}-${tag.key}-${tagIndex}`}
                            tag={tag}
                            onClick={(value) => {
                              onTagClick?.(value);
                              // Zabráni bubbling
                            }}
                          />
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Katastrálne územie */}
                <div className="col-span-3 text-sm text-gray-900 dark:text-gray-100 truncate">
                  {result.katastralne_uzemie}
                </div>

                {/* Poradie */}
                <div className="col-span-1 text-sm text-gray-900 dark:text-gray-100 font-mono">
                  {result.poradie}
                </div>

                {/* LV */}
                <div className="col-span-1 text-sm text-gray-900 dark:text-gray-100 font-mono">
                  {result.lv}
                </div>

                {/* Action tlačidlá a expand indikátor */}
                <div className="col-span-1 flex items-center justify-center gap-1">
                  {/* Kataster PDF */}
                  <a
                    href={`https://kataster.skgeodesy.sk/Portal45/api/Bo/GeneratePrfPublic/?cadastralUnitCode=${result.poradie}&prfNumber=${result.lv}&outputType=pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 transition-colors"
                    title={`Kataster PDF: Poradie ${result.poradie}, LV ${result.lv}`}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>

                  {/* Google Search */}
                  {(() => {
                    const googleUrl = createGoogleSearchUrl(result.meno_raw, result.katastralne_uzemie);
                    const isAvailable = isGoogleSearchAvailable(result.meno_raw);
                    const description = createGoogleSearchDescription(result.meno_raw, result.katastralne_uzemie);
                    
                    return isAvailable && googleUrl ? (
                      <a
                        href={googleUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 transition-colors"
                        title={description}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Search className="h-4 w-4" />
                      </a>
                    ) : (
                      <div 
                        className="p-1 rounded text-gray-400 dark:text-gray-600 cursor-not-allowed"
                        title="Google vyhľadávanie nie je k dispozícii"
                      >
                        <Search className="h-4 w-4" />
                      </div>
                    );
                  })()}

                  {/* Google Maps */}
                  {(() => {
                    const isAvailable = isGoogleMapsAvailable(result.katastralne_uzemie);
                    const geocodingData = geocodingResults.get(result.katastralne_uzemie);
                    const mapsUrl = geocodingData?.googleMapsUrl || createGoogleMapsUrl(result.katastralne_uzemie);
                    const description = createGoogleMapsDescription(result.katastralne_uzemie);
                    
                    return isAvailable ? (
                      <a
                        href={mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`p-1 rounded transition-colors ${
                          geocodingData?.loading 
                            ? 'text-gray-400 dark:text-gray-600 cursor-wait'
                            : 'hover:bg-orange-100 dark:hover:bg-orange-900/30 text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-300'
                        }`}
                        title={geocodingData?.hasCoordinates ? `${description} (s presnou polohou)` : description}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MapPin className="h-4 w-4" />
                      </a>
                    ) : (
                      <div 
                        className="p-1 rounded text-gray-400 dark:text-gray-600 cursor-not-allowed"
                        title="Google Maps nie je k dispozícii"
                      >
                        <MapPin className="h-4 w-4" />
                      </div>
                    );
                  })()}

                  {/* ZBGIS LV Detail */}
                  {(() => {
                    const geocodingData = geocodingResults.get(result.katastralne_uzemie);
                    const zbgisLvUrl = createZbgisLvUrl(result.poradie, result.lv, geocodingData?.coordinates || undefined);
                    const hasCoordinates = geocodingData?.hasCoordinates || false;
                    const description = createZbgisLvDescription(result.poradie, result.lv, hasCoordinates);
                    
                    return (
                      <a
                        href={zbgisLvUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`p-1 rounded transition-colors ${
                          geocodingData?.loading 
                            ? 'text-gray-400 dark:text-gray-600 cursor-wait'
                            : 'hover:bg-purple-100 dark:hover:bg-purple-900/30 text-purple-600 dark:text-purple-400 hover:text-purple-800 dark:hover:text-purple-300'
                        }`}
                        title={description}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Map className="h-4 w-4" />
                      </a>
                    );
                  })()}

                  {/* Expand indikátor */}
                  <div className={`p-1 rounded-full transition-all duration-200 ${
                    expandedRecords.has(result.id)
                      ? 'bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300'
                      : 'text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-600 hover:text-gray-600 dark:hover:text-gray-300'
                  }`}>
                    {expandedRecords.has(result.id) ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Detail záznamu - accordion */}
            <RecordDetail
              record={result}
              isOpen={expandedRecords.has(result.id)}
              onToggle={() => toggleRecordDetail(result.id)}
              onSearch={onSearch}
            />
          </div>
        ))}
      </div>

      {/* Pagination */}
      {pagination && (
        <Pagination
          currentPage={pagination.currentPage}
          totalPages={pagination.totalPages}
          onPageChange={pagination.onPageChange}
          onPrevious={pagination.onPrevious}
          onNext={pagination.onNext}
          canPrevious={pagination.canPrevious}
          canNext={pagination.canNext}
          pageSize={pagination.pageSize}
          onPageSizeChange={pagination.onPageSizeChange}
          totalResults={pagination.totalResults}
        />
      )}
    </div>
  );
}

