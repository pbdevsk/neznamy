'use client';

import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';

interface PaginationProps {
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
}

export function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  onPrevious,
  onNext,
  canPrevious,
  canNext,
  pageSize,
  onPageSizeChange,
  totalResults
}: PaginationProps) {
  // Generate page numbers to display
  const generatePageNumbers = () => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 7; // Show up to 7 page numbers
    
    if (totalPages <= maxVisible) {
      // Show all pages if total is small
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Complex logic for ellipsis
      pages.push(1);
      
      if (currentPage <= 4) {
        // Near beginning: 1 2 3 4 5 ... 10
        for (let i = 2; i <= Math.min(5, totalPages - 1); i++) {
          pages.push(i);
        }
        if (totalPages > 5) {
          pages.push('ellipsis');
          pages.push(totalPages);
        }
      } else if (currentPage >= totalPages - 3) {
        // Near end: 1 ... 6 7 8 9 10
        pages.push('ellipsis');
        for (let i = Math.max(totalPages - 4, 2); i <= totalPages; i++) {
          pages.push(i);
        }
      } else {
        // Middle: 1 ... 4 5 6 ... 10
        pages.push('ellipsis');
        for (let i = currentPage - 1; i <= currentPage + 1; i++) {
          pages.push(i);
        }
        pages.push('ellipsis');
        pages.push(totalPages);
      }
    }
    
    return pages;
  };

  const pageNumbers = generatePageNumbers();

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-3 sm:px-6">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Left side - Page size selector and info */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-700 dark:text-gray-300">Zobrazí:</span>
            <select 
              value={pageSize} 
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-2 py-1 text-sm text-gray-900 dark:text-white focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value={500}>500</option>
            </select>
          </div>
          {totalResults && (
            <span className="text-gray-500 dark:text-gray-400">
              z {totalResults.toLocaleString()} záznamov
            </span>
          )}
        </div>

        {/* Right side - Page navigation */}
        <div className="flex items-center gap-1">
          {/* Previous button */}
          <button
            onClick={onPrevious}
            disabled={!canPrevious}
            className="relative inline-flex items-center rounded-l-md px-2 py-2 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 focus:z-20 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="h-4 w-4" />
            <span className="sr-only">Predchádzajúca</span>
          </button>

          {/* Page numbers */}
          <div className="flex">
            {pageNumbers.map((pageNum, index) => {
              if (pageNum === 'ellipsis') {
                return (
                  <span
                    key={`ellipsis-${index}`}
                    className="relative inline-flex items-center px-4 py-2 text-sm text-gray-500 dark:text-gray-400"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </span>
                );
              }

              const isCurrentPage = pageNum === currentPage;
              
              return (
                <button
                  key={pageNum}
                  onClick={() => onPageChange(pageNum)}
                  className={`relative inline-flex items-center px-3 py-2 text-sm font-medium focus:z-20 focus:outline-none focus:ring-1 focus:ring-blue-500 ${
                    isCurrentPage
                      ? 'z-10 bg-blue-50 dark:bg-blue-900/50 border-blue-500 text-blue-600 dark:text-blue-400'
                      : 'text-gray-900 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
          </div>

          {/* Next button */}
          <button
            onClick={onNext}
            disabled={!canNext}
            className="relative inline-flex items-center rounded-r-md px-2 py-2 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 focus:z-20 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ChevronRight className="h-4 w-4" />
            <span className="sr-only">Ďalšia</span>
          </button>
        </div>
      </div>
    </div>
  );
}
