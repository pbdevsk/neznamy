'use client';

import { useState, useEffect } from 'react';
import { Upload, Database } from 'lucide-react';
import { SearchFilters } from '@/components/search-filters';
import { ResultsTable } from '@/components/results-table';
import { GroupedResults } from '@/components/grouped-results';
import { FacetsPanel } from '@/components/facets-panel';
import { ImportModal } from '@/components/import-modal';
import { ThemeToggle } from '@/components/theme-toggle';
import { DebugInfo } from '@/components/debug-info';


import type { SearchResult, Facets } from '@/lib/db';
import type { SearchFilters as SearchFiltersType } from '@/components/search-filters';

interface Stats {
  owners: number;
  tags: number;
  territories: number;
}

export default function Home() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [facets, setFacets] = useState<Facets>({ given_names: [], maiden_names: [], status: [] });
  const [territories, setTerritories] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>({ owners: 0, tags: 0, territories: 0 });
  const [loading, setLoading] = useState(false);
  const [facetsLoading, setFacetsLoading] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const [currentFilters, setCurrentFilters] = useState<SearchFiltersType>({
    q: '',
    kuz: 'Všetky',
    lv: '',
    region_id: '',
    district_id: '',
    mode: 'contains',
    groupByLv: false
  });
  const [nextCursor, setNextCursor] = useState<string | undefined>();
  const [currentPage, setCurrentPage] = useState(1);

  // Načítanie dát pri spustení
  useEffect(() => {
    fetchTerritories();
    fetchStats();
  }, []);

  const fetchTerritories = async () => {
    try {
      const response = await fetch('/api/territories');
      if (response.ok) {
        const data = await response.json();
        setTerritories(data);
      }
    } catch (error) {
      console.error('Chyba pri načítavaní území:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Chyba pri načítavaní štatistík:', error);
    }
  };

  const performSearch = async (filters: SearchFiltersType, cursor?: string) => {
    setLoading(true);
    
    try {
      const params = new URLSearchParams();
      if (filters.q) params.append('q', filters.q);
      if (filters.kuz && filters.kuz !== 'Všetky') params.append('kuz', filters.kuz);
      if (filters.lv) params.append('lv', filters.lv);
      if (filters.region_id) params.append('region_id', filters.region_id);
      if (filters.district_id) params.append('district_id', filters.district_id);
      params.append('mode', filters.mode);
      params.append('limit', '50');
      if (cursor) params.append('cursor', cursor);

      const response = await fetch(`/api/search?${params}`);
      if (response.ok) {
        const data = await response.json();
        setResults(data.items);
        setNextCursor(data.next_cursor);
        
        // Aktualizácia počtu záznamov v UI
        const recordCountElement = document.getElementById('record-count');
        if (recordCountElement) {
          recordCountElement.textContent = `Záznamov: ${data.items.length}${data.next_cursor ? '+' : ''}`;
        }
      } else {
        setResults([]);
        setNextCursor(undefined);
      }
    } catch (error) {
      console.error('Chyba pri vyhľadávaní:', error);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchFacets = async (filters: SearchFiltersType) => {
    setFacetsLoading(true);
    
    try {
      const params = new URLSearchParams();
      if (filters.q) params.append('q', filters.q);
      if (filters.kuz && filters.kuz !== 'Všetky') params.append('kuz', filters.kuz);
      if (filters.lv) params.append('lv', filters.lv);
      if (filters.region_id) params.append('region_id', filters.region_id);
      if (filters.district_id) params.append('district_id', filters.district_id);
      params.append('mode', filters.mode);

      const response = await fetch(`/api/facets?${params}`);
      if (response.ok) {
        const data = await response.json();
        setFacets(data);
      }
    } catch (error) {
      console.error('Chyba pri načítavaní facetov:', error);
    } finally {
      setFacetsLoading(false);
    }
  };

  const handleSearch = async (filters: SearchFiltersType) => {
    setCurrentFilters(filters);
    setCurrentPage(1);
    setNextCursor(undefined);
    
    await Promise.all([
      performSearch(filters),
      fetchFacets(filters)
    ]);
  };

  const handleTagClick = (value: string) => {
    const newFilters = {
      ...currentFilters,
      q: currentFilters.q ? `${currentFilters.q} ${value}` : value
    };
    handleSearch(newFilters);
  };

  const handleNameSearch = (name: string) => {
    const newFilters = {
      ...currentFilters,
      q: name // Nahradi aktuálny dotaz novým menom
    };
    handleSearch(newFilters);
  };

  const handleFacetClick = (value: string) => {
    handleTagClick(value);
  };

  const handleNextPage = () => {
    if (nextCursor) {
      setCurrentPage(prev => prev + 1);
      performSearch(currentFilters, nextCursor);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
      // Pre jednoduchosť implementácie, vrátime sa na začiatok
      performSearch(currentFilters);
    }
  };

  const handleImportSuccess = () => {
    // Refresh territories a ostatné dáta
    fetchTerritories();
    fetchStats(); // Refresh štatistiky po importe
    if (currentFilters.q || currentFilters.kuz !== 'Všetky' || currentFilters.lv) {
      handleSearch(currentFilters);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Sticky header */}
      <div className="sticky top-0 z-40 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        {/* Horný panel s nadpisom a prepínačom témy */}
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-100 dark:bg-blue-900 rounded-full">
              <Database className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
                Register neznámych vlastníkov
              </h1>
              {/* Štatistiky */}
              <div className="flex items-center gap-4 mt-2 text-sm text-gray-600 dark:text-gray-400">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  {stats.owners.toLocaleString('sk-SK')} vlastníkov
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  {stats.tags.toLocaleString('sk-SK')} tagov
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                  {stats.territories} území
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors"
            >
              <Upload className="h-4 w-4" />
              Import CSV
            </button>

            <ThemeToggle />
          </div>
        </div>

        {/* Filter panel */}
        <SearchFilters
          onSearch={handleSearch}
          territories={territories}
          loading={loading}
        />
      </div>

      {/* Main content */}
      <div className="flex gap-6 p-6">
        {/* Výsledky (ľavá strana) */}
        <div className="flex-1">
          {currentFilters.groupByLv ? (
            <GroupedResults
              results={results}
              loading={loading}
              onTagClick={handleTagClick}
              onSearch={handleNameSearch}
              pagination={{
                currentPage,
                totalPages: nextCursor ? currentPage + 1 : currentPage,
                onPrevious: handlePreviousPage,
                onNext: handleNextPage,
                canPrevious: currentPage > 1,
                canNext: !!nextCursor
              }}
            />
          ) : (
            <ResultsTable
              results={results}
              loading={loading}
              onTagClick={handleTagClick}
              onSearch={handleNameSearch}
              pagination={{
                currentPage,
                totalPages: nextCursor ? currentPage + 1 : currentPage,
                onPrevious: handlePreviousPage,
                onNext: handleNextPage,
                canPrevious: currentPage > 1,
                canNext: !!nextCursor
              }}
            />
          )}
        </div>

        {/* Facety (pravá strana) */}
        <div className="w-80 hidden lg:block">
          <FacetsPanel
            facets={facets}
            loading={facetsLoading}
            onFacetClick={handleFacetClick}
          />
        </div>
      </div>

      {/* Facety na mobile (pod tabuľkou) */}
      <div className="block lg:hidden px-6 pb-6">
        <FacetsPanel
          facets={facets}
          loading={facetsLoading}
          onFacetClick={handleFacetClick}
        />
      </div>

      {/* Import modal */}
      <ImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={handleImportSuccess}
      />



      {/* Debug info panel */}
      <DebugInfo />
    </div>
  );
}