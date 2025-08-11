'use client';

import { Search, X, ChevronDown, ChevronUp, Settings } from 'lucide-react';
import { useState, useEffect } from 'react';

interface Region {
  id: number;
  name: string;
  shortcut: string;
  count: number;
}

interface District {
  id: number;
  name: string;
  vehicle_registration: string;
  code: number;
  region_id: number;
  region_name: string;
  region_shortcut: string;
  count: number;
}

interface SearchFiltersProps {
  onSearch: (filters: SearchFilters) => void;
  territories: string[];
  loading?: boolean;
}

export interface SearchFilters {
  q: string;
  kuz: string;
  lv: string;
  region_id: string;
  district_id: string;
  mode: 'contains' | 'exact' | 'starts';
  groupByLv: boolean;
}

export function SearchFilters({ onSearch, territories, loading }: SearchFiltersProps) {
  const [filters, setFilters] = useState<SearchFilters>({
    q: '',
    kuz: 'Všetky',
    lv: '',
    region_id: '',
    district_id: '',
    mode: 'contains',
    groupByLv: false
  });

  const [regions, setRegions] = useState<Region[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [loadingDistricts, setLoadingDistricts] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Načítanie krajov pri načítaní komponenty
  useEffect(() => {
    const fetchRegions = async () => {
      setLoadingRegions(true);
      try {
        const response = await fetch('/api/regions');
        if (response.ok) {
          const data = await response.json();
          setRegions(data);
        }
      } catch (error) {
        console.error('Chyba pri načítavaní krajov:', error);
      } finally {
        setLoadingRegions(false);
      }
    };

    fetchRegions();
  }, []);

  // Načítanie okresov pri zmene kraja
  useEffect(() => {
    if (filters.region_id) {
      const fetchDistricts = async () => {
        setLoadingDistricts(true);
        try {
          const response = await fetch(`/api/districts?region_id=${filters.region_id}`);
          if (response.ok) {
            const data = await response.json();
            setDistricts(data);
          }
        } catch (error) {
          console.error('Chyba pri načítavaní okresov:', error);
        } finally {
          setLoadingDistricts(false);
        }
      };

      fetchDistricts();
    } else {
      setDistricts([]);
      setFilters(prev => ({ ...prev, district_id: '' }));
    }
  }, [filters.region_id]);

  const handleSearch = () => {
    onSearch(filters);
  };

  const handleClear = () => {
    const clearedFilters: SearchFilters = {
      q: '',
      kuz: 'Všetky',
      lv: '',
      region_id: '',
      district_id: '',
      mode: 'contains',
      groupByLv: false
    };
    setFilters(clearedFilters);
    setDistricts([]); // Vyčistenie okresov
    onSearch(clearedFilters);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const hasActiveFilters = filters.q || filters.kuz !== 'Všetky' || filters.lv || filters.region_id || filters.district_id || filters.groupByLv;

  return (
    <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4 space-y-4">
      {/* Základné filtre */}
      <div className="flex flex-wrap gap-4 items-end">
        {/* Vyhľadávanie */}
        <div className="flex-1 min-w-64">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Vyhľadávanie
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              onKeyPress={handleKeyPress}
              placeholder="novotna, petrilak vasil, ema r. blaskova"
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={loading}
            />
          </div>
        </div>

        {/* Katastrálne územie */}
        <div className="min-w-48">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Katastrálne územie
          </label>
          <select
            value={filters.kuz}
            onChange={(e) => setFilters({ ...filters, kuz: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          >
            <option value="Všetky">Všetky</option>
            {territories.map((territory) => (
              <option key={territory} value={territory}>
                {territory}
              </option>
            ))}
          </select>
        </div>

        {/* LV */}
        <div className="min-w-32">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            LV
          </label>
          <input
            type="number"
            value={filters.lv}
            onChange={(e) => setFilters({ ...filters, lv: e.target.value })}
            onKeyPress={handleKeyPress}
            placeholder="číslo"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={loading}
          />
        </div>

        {/* Toggle pre rozšírené filtre */}
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <Settings className="h-4 w-4" />
            Rozšírené
            {showAdvanced ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Tlačidlá */}
        <div className="flex gap-2">
          <button
            onClick={handleSearch}
            disabled={loading}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md transition-colors flex items-center gap-2"
          >
            <Search className="h-4 w-4" />
            Hľadať
          </button>
          <button
            onClick={handleClear}
            disabled={loading}
            className="px-4 py-2 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 text-white rounded-md transition-colors flex items-center gap-2"
          >
            <X className="h-4 w-4" />
            Vyčistiť
          </button>
        </div>
      </div>

      {/* Rozšírené filtre */}
      {showAdvanced && (
        <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 border border-gray-200 dark:border-gray-600">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Rozšírené filtre
          </h3>
          <div className="flex flex-wrap gap-4 items-end">
            {/* Kraj */}
            <div className="min-w-48">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Kraj
              </label>
              <select
                value={filters.region_id}
                onChange={(e) => setFilters({ ...filters, region_id: e.target.value, district_id: '' })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading || loadingRegions}
              >
                <option value="">Všetky kraje</option>
                {regions.map((region) => (
                  <option key={region.id} value={region.id.toString()}>
                    {region.name} ({region.count.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            {/* Okres */}
            <div className="min-w-48">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Okres
              </label>
              <select
                value={filters.district_id}
                onChange={(e) => setFilters({ ...filters, district_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading || loadingDistricts || !filters.region_id}
              >
                <option value="">Všetky okresy</option>
                {districts.map((district) => (
                  <option key={district.id} value={district.id.toString()}>
                    {district.name} ({district.count.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            {/* Režim vyhľadávania */}
            <div className="min-w-40">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Režim vyhľadávania
              </label>
              <select
                value={filters.mode}
                onChange={(e) => setFilters({ ...filters, mode: e.target.value as SearchFilters['mode'] })}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loading}
              >
                <option value="contains">Obsahuje</option>
                <option value="exact">Presná zhoda</option>
                <option value="starts">Začína na</option>
              </select>
            </div>

            {/* Group by LV checkbox */}
            <div className="flex items-center">
              <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.groupByLv}
                  onChange={(e) => setFilters({ ...filters, groupByLv: e.target.checked })}
                  className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  disabled={loading}
                />
                Zoskupiť podľa LV
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Sekundárny riadok s informáciami */}
      <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-4">
        <span id="record-count">Záznamov: -</span>
        {hasActiveFilters && (
          <span>
            Aktívne filtre: {[
              filters.q && `text: "${filters.q}"`,
              filters.kuz !== 'Všetky' && `územie: ${filters.kuz}`,
              filters.lv && `LV: ${filters.lv}`,
              filters.mode !== 'contains' && `režim: ${filters.mode}`
            ].filter(Boolean).join(', ')}
          </span>
        )}
      </div>
    </div>
  );
}

