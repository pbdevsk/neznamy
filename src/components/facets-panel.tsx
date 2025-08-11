'use client';

import type { Facets } from '@/lib/db';

interface FacetsPanelProps {
  facets: Facets;
  loading?: boolean;
  onFacetClick?: (value: string) => void;
}

export function FacetsPanel({ facets, loading, onFacetClick }: FacetsPanelProps) {
  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="animate-pulse space-y-6">
          {[...Array(3)].map((_, sectionIndex) => (
            <div key={sectionIndex} className="space-y-3">
              <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
              <div className="space-y-2">
                {[...Array(5)].map((_, itemIndex) => (
                  <div key={itemIndex} className="flex justify-between">
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                    <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-8"></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const sections = [
    {
      title: 'Najčastejšie mená',
      items: facets.given_names,
      color: 'text-blue-600 dark:text-blue-400'
    },
    {
      title: 'Dátumy úmrtia',
      items: facets.maiden_names,
      color: 'text-gray-600 dark:text-gray-400'
    },
    {
      title: 'Katastrálne územia',
      items: facets.status,
      color: 'text-green-600 dark:text-green-400'
    }
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 space-y-6">
      {sections.map((section, sectionIndex) => (
        <div key={sectionIndex} className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
            {section.title}
          </h3>
          
          {section.items.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Žiadne údaje
            </p>
          ) : (
            <div className="space-y-1">
              {section.items.map((item, itemIndex) => (
                <button
                  key={itemIndex}
                  onClick={() => onFacetClick?.(item.value)}
                  className="w-full flex items-center justify-between py-1.5 px-2 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left group"
                >
                  <span className="text-sm font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate mr-2">
                    {item.value}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded-full min-w-fit">
                    {item.count.toLocaleString()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

