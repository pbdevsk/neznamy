'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<string>('light');

  useEffect(() => {
    setMounted(true);
    // Manual check HTML class
    const isDark = document.documentElement.classList.contains('dark');
    setCurrentTheme(isDark ? 'dark' : 'light');
  }, []);

  useEffect(() => {
    if (mounted && resolvedTheme) {
      setCurrentTheme(resolvedTheme);
    }
  }, [resolvedTheme, mounted]);

  if (!mounted) {
    return (
      <div className="w-9 h-9 bg-gray-200 rounded-md animate-pulse" />
    );
  }

  const handleToggle = () => {
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    // Manual toggle class (fallback ak next-themes nefunguje)
    if (newTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    setTheme(newTheme);
    setCurrentTheme(newTheme);
  };

  return (
    <button
      onClick={handleToggle}
      className="w-9 h-9 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
      aria-label="Prepnúť tému"
      title={`Aktuálne: ${currentTheme}, kliknite pre ${currentTheme === 'dark' ? 'svetlú' : 'tmavú'} tému`}
    >
      {currentTheme === 'dark' ? (
        <Sun className="h-4 w-4 text-yellow-500" />
      ) : (
        <Moon className="h-4 w-4 text-gray-600" />
      )}
    </button>
  );
}