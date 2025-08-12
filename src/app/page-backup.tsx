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

export default function BackupHome() {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [facets, setFacets] = useState<Facets>({ given_names: [], maiden_names: [], status: [] });
  const [territories, setTerritories] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>({ owners: 0, tags: 0, territories: 0 });
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState<number>(0);
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
  const [pageSize, setPageSize] = useState(50);

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
      params.append('limit', pageSize.toString());
      if (cursor) params.append('cursor', cursor);

      const response = await fetch(`/api/search?${params}`);
      if (response.ok) {
        const data = await response.json();
        setResults(data.items);
        setNextCursor(data.next_cursor);
        setTotalCount(data.total_estimated || data.items.length);
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

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1);
    setNextCursor(undefined);
    // performSearch sa spustí automaticky kvôli useEffect dependency
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    // Pre jednoduchosť implementácie - cursor-based pagination je komplexnejšia
    // Pre teraz sa vrátime na začiatok a simulujeme stránkovanie
    performSearch(currentFilters);
  };

  // useEffect pre performSearch keď sa zmení pageSize
  useEffect(() => {
    if (currentFilters.q || currentFilters.kuz !== 'Všetky' || currentFilters.lv || 
        currentFilters.region_id || currentFilters.district_id) {
      performSearch(currentFilters);
    }
  }, [pageSize]);

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
      {/* Stats and Search Section */}
      <div className="sticky top-16 z-30 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700/50">
        {/* Stats bar */}
        <div className="px-6 py-3 border-b border-gray-200/30 dark:border-gray-700/30">
          <div className="flex items-center justify-between">
            {/* Stats */}
            <div className="flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full"></div>
                <span className="font-medium">{stats.owners.toLocaleString('sk-SK')}</span>
                <span>vlastníkov</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                <span className="font-medium">{stats.tags.toLocaleString('sk-SK')}</span>
                <span>tagov</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 bg-purple-500 rounded-full"></div>
                <span className="font-medium">{stats.territories}</span>
                <span>území</span>
              </div>
            </div>
            
            {/* Import button */}
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-all hover:shadow-md"
            >
              <Upload className="h-4 w-4" />
              <span className="hidden sm:inline">Import CSV</span>
            </button>
          </div>
        </div>

        {/* Search filters */}
        <div>
          <SearchFilters
            onSearch={handleSearch}
            territories={territories}
            loading={loading}
          />
        </div>
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
                onPageChange: handlePageChange,
                onPrevious: handlePreviousPage,
                onNext: handleNextPage,
                canPrevious: currentPage > 1,
                canNext: !!nextCursor,
                pageSize,
                onPageSizeChange: handlePageSizeChange,
                totalResults: totalCount
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
                onPageChange: handlePageChange,
                onPrevious: handlePreviousPage,
                onNext: handleNextPage,
                canPrevious: currentPage > 1,
                canNext: !!nextCursor,
                pageSize,
                onPageSizeChange: handlePageSizeChange,
                totalResults: totalCount
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
