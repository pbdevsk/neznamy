'use client';

import { useState, useEffect } from 'react';
import { AdvancedParserDemo } from '@/components/advanced-parser-demo';
import { Database } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

// Importuj starý main screen komponent
import BackupHome from './page-backup';

interface Stats {
  owners: number;
  tags: number;
  territories: number;
}

export default function Home() {
  const [stats, setStats] = useState<Stats>({ owners: 0, tags: 0, territories: 0 });
  const [loading, setLoading] = useState(true);
  const [hasData, setHasData] = useState(false);

  // Načítanie štatistík pri spustení
  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
        setHasData(data.owners > 0);
      }
    } catch (error) {
      console.error('Chyba pri načítavaní štatistík:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImportSuccess = () => {
    // Po úspešnom importe aktualizuj štatistiky a prepni na vyhľadávanie
    fetchStats();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg inline-block mb-4">
            <Database className="h-8 w-8 text-blue-600 dark:text-blue-400 animate-pulse" />
          </div>
          <p className="text-gray-600 dark:text-gray-400">Načítavam...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Simple Header */}
      <div className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200/50 dark:border-gray-700/50">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
                <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Register neznámych vlastníkov
              </h1>
              {hasData && (
                <div className="hidden lg:flex items-center gap-6 text-sm text-gray-600 dark:text-gray-400 ml-6">
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
              )}
            </div>
            <ThemeToggle />
          </div>
        </div>
      </div>

      {/* Conditional Content */}
      <div className="relative">
        {hasData ? (
          <BackupHome />
        ) : (
          <AdvancedParserDemo onImportSuccess={handleImportSuccess} />
        )}
      </div>
    </div>
  );
}