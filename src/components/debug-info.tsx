'use client';

import { useState, useEffect } from 'react';

export function DebugInfo() {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    // Intercept console.log for debug display
    const originalLog = console.log;
    const originalGroup = console.group;
    const originalGroupEnd = console.groupEnd;

    let groupLevel = 0;

    console.group = (...args) => {
      groupLevel++;
      const indent = '  '.repeat(groupLevel - 1);
      setLogs(prev => [...prev, `${indent}📂 ${args.join(' ')}`]);
      originalGroup.apply(console, args);
    };

    console.groupEnd = () => {
      groupLevel = Math.max(0, groupLevel - 1);
      originalGroupEnd();
    };

    console.log = (...args) => {
      const indent = '  '.repeat(groupLevel);
      const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      setLogs(prev => [...prev.slice(-50), `${indent}${message}`]); // Keep last 50 logs
      originalLog.apply(console, args);
    };

    return () => {
      console.log = originalLog;
      console.group = originalGroup;
      console.groupEnd = originalGroupEnd;
    };
  }, []);

  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <div className="fixed bottom-4 right-4 w-96 max-h-96 bg-black bg-opacity-90 text-green-400 text-xs p-4 rounded-lg overflow-y-auto font-mono z-50">
      <div className="flex justify-between items-center mb-2 text-white">
        <span>Debug Console</span>
        <button 
          onClick={() => setLogs([])}
          className="text-red-400 hover:text-red-300"
        >
          Clear
        </button>
      </div>
      <div className="space-y-1">
        {logs.map((log, index) => (
          <div key={index} className="whitespace-pre-wrap break-words">
            {log}
          </div>
        ))}
      </div>
    </div>
  );
}
