'use client';

import { useState, useRef } from 'react';
import { Upload, X, AlertCircle, CheckCircle, Clock, BarChart3 } from 'lucide-react';
import { debugLog, debugError, debugAPI } from '@/lib/debug';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface ColumnMapping {
  [key: string]: string;
}

interface ImportResult {
  sourceId: number;
  totalRows: number;
  successfulRows: number;
  errors: string[];
  duration: number;
}

interface ProgressUpdate {
  phase: 'parsing' | 'processing' | 'inserting' | 'tagging' | 'completed' | 'error';
  progress: number; // 0-100
  totalRows: number;
  processedRows: number;
  currentRow?: number;
  message: string;
  timeElapsed: number;
  estimatedTimeRemaining?: number;
  errors: string[];
  successfulRows?: number;
  sourceId?: number;
}

export function ImportModal({ isOpen, onClose, onSuccess }: ImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [delimiter, setDelimiter] = useState<string>(',');
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [availableColumns, setAvailableColumns] = useState<string[]>([]);
  const [step, setStep] = useState<'upload' | 'mapping' | 'importing' | 'result'>('upload');
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string>('');
  const [progressUpdate, setProgressUpdate] = useState<ProgressUpdate | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const requiredFields = [
    { key: 'katastralne_uzemie', label: 'Katastrálne územie' },
    { key: 'poradie', label: 'Poradie' },
    { key: 'lv', label: 'LV' },
    { key: 'meno', label: 'Meno neznámeho vlastníka' }
  ];

  const handleFileSelect = async (selectedFile: File) => {
    debugLog('File selection', { 
      name: selectedFile.name, 
      size: selectedFile.size, 
      type: selectedFile.type 
    });
    
    setFile(selectedFile);
    setError('');
    
    try {
      // Načítaj prvý riadok pre detekciu stĺpcov
      const text = await selectedFile.text();
      const lines = text.split('\n');
      debugLog('CSV preview', { 
        totalLines: lines.length, 
        firstLine: lines[0],
        delimiter 
      });
      
      if (lines.length > 0) {
        const firstLine = lines[0];
        const columns = firstLine.split(delimiter).map(col => col.trim().replace(/"/g, ''));
        setAvailableColumns(columns);
        debugLog('Detected columns', columns);
        
        // Automatické mapovanie na základe názvov
        const autoMapping: ColumnMapping = {};
        columns.forEach(col => {
          const lowerCol = col.toLowerCase();
          if (lowerCol.includes('katastrál') || lowerCol.includes('územie')) {
            autoMapping.katastralne_uzemie = col;
          } else if (lowerCol.includes('poradie') || lowerCol.includes('číslo')) {
            autoMapping.poradie = col;
          } else if (lowerCol === 'lv' || lowerCol.includes('vlastníctv')) {
            autoMapping.lv = col;
          } else if (lowerCol.includes('meno') || lowerCol.includes('vlastník')) {
            autoMapping.meno = col;
          }
        });
        setColumnMapping(autoMapping);
        debugLog('Auto mapping', autoMapping);
        setStep('mapping');
      }
    } catch (err) {
      debugError('File reading', err);
      setError('Chyba pri načítavaní súboru');
    }
  };

  const handleImport = async () => {
    debugLog('Import attempt', { 
      hasFile: !!file, 
      isMappingComplete, 
      delimiter, 
      columnMapping 
    });
    
    if (!file) {
      setError('Nie je vybratý žiadny súbor');
      return;
    }
    
    if (!isMappingComplete) {
      setError('Mapovanie stĺpcov nie je kompletné');
      return;
    }
    
    setStep('importing');
    setError('');
    setProgressUpdate(null);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('delimiter', delimiter);
      formData.append('columnMapping', JSON.stringify(columnMapping));

      debugAPI('POST', '/api/import-progress', {
        fileName: file.name,
        delimiter,
        columnMapping
      });

      const response = await fetch('/api/import-progress', {
        method: 'POST',
        body: formData
      });

      debugLog('Import response', {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Neznáma chyba servera' }));
        debugError('Import API error', { status: response.status, errorData });
        throw new Error(errorData.error || `HTTP ${response.status}: Chyba pri importe`);
      }

      // Read Server-Sent Events stream
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('Nemožno čítať response stream');
      }

      while (true) {
        const { done, value } = await reader.read();
        
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data: ProgressUpdate = JSON.parse(line.substring(6));
              setProgressUpdate(data);
              
              if (data.phase === 'completed') {
                // Convert to ImportResult format
                const result: ImportResult = {
                  sourceId: data.sourceId || 0,
                  totalRows: data.totalRows,
                  successfulRows: data.successfulRows || 0,
                  errors: data.errors,
                  duration: data.timeElapsed
                };
                
                setImportResult(result);
                setStep('result');
                
                if (result.successfulRows > 0) {
                  onSuccess();
                }
                return;
              }
              
              if (data.phase === 'error') {
                throw new Error(data.message);
              }
              
            } catch (parseError) {
              debugError('Error parsing progress data', parseError);
            }
          }
        }
      }
    } catch (err) {
      debugError('Import error', err);
      setError(err instanceof Error ? err.message : 'Neznáma chyba pri importe');
      setStep('result');
    }
  };

  const handleClose = () => {
    setFile(null);
    setColumnMapping({});
    setAvailableColumns([]);
    setStep('upload');
    setImportResult(null);
    setError('');
    onClose();
  };

  const isMappingComplete = requiredFields.every(field => columnMapping[field.key]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Import CSV súboru
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6">
          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Výber CSV súboru
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 dark:hover:border-blue-400 transition-colors"
                >
                  <div className="flex flex-col items-center">
                    <Upload className="h-12 w-12 text-gray-400 mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">
                      Kliknite pre výber CSV súboru
                    </p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.tsv"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  className="hidden"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Oddeľovač stĺpcov
                </label>
                <select
                  value={delimiter}
                  onChange={(e) => setDelimiter(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  <option value=",">Čiarka (,)</option>
                  <option value=";">Bodkočiarka (;)</option>
                  <option value="\t">Tabulátor</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 2: Column Mapping */}
          {step === 'mapping' && (
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">
                  Mapovanie stĺpcov
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Priraďte stĺpce z CSV súboru k povinným poliam:
                </p>
              </div>

              <div className="space-y-4">
                {requiredFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      {field.label}
                    </label>
                    <select
                      value={columnMapping[field.key] || ''}
                      onChange={(e) => setColumnMapping({ ...columnMapping, [field.key]: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">Vyberte stĺpec...</option>
                      {availableColumns.map((col) => (
                        <option key={col} value={col}>
                          {col}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setStep('upload')}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                >
                  Späť
                </button>
                <button
                  onClick={handleImport}
                  disabled={!isMappingComplete}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-md transition-colors"
                >
                  Importovať
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Importing */}
          {step === 'importing' && (
            <div className="py-6 space-y-6">
              {/* Header */}
              <div className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <BarChart3 className="h-6 w-6 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Import v priebehu
                  </h3>
                </div>
                {file && (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {file.name} ({Math.round(file.size / 1024 / 1024)}MB)
                  </p>
                )}
              </div>

              {progressUpdate && (
                <>
                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-400">
                        {progressUpdate.message}
                      </span>
                      <span className="text-gray-900 dark:text-white font-medium">
                        {progressUpdate.progress.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3">
                      <div 
                        className="bg-blue-600 h-3 rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${progressUpdate.progress}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Statistics Grid */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Processed Rows */}
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Spracované riadky
                      </div>
                      <div className="text-lg font-semibold text-gray-900 dark:text-white">
                        {progressUpdate.processedRows.toLocaleString()} / {progressUpdate.totalRows.toLocaleString()}
                      </div>
                    </div>

                    {/* Time Elapsed */}
                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                      <div className="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Čas
                      </div>
                      <div className="text-lg font-semibold text-gray-900 dark:text-white">
                        {Math.floor(progressUpdate.timeElapsed / 1000)}s
                      </div>
                    </div>

                    {/* Success Rate */}
                    {progressUpdate.successfulRows !== undefined && (
                      <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3">
                        <div className="text-sm text-green-600 dark:text-green-400">
                          Úspešné záznamy
                        </div>
                        <div className="text-lg font-semibold text-green-700 dark:text-green-300">
                          {progressUpdate.successfulRows.toLocaleString()}
                        </div>
                      </div>
                    )}

                    {/* ETA */}
                    {progressUpdate.estimatedTimeRemaining && progressUpdate.estimatedTimeRemaining > 0 && (
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3">
                        <div className="text-sm text-blue-600 dark:text-blue-400">
                          Zostáva cca
                        </div>
                        <div className="text-lg font-semibold text-blue-700 dark:text-blue-300">
                          {Math.floor(progressUpdate.estimatedTimeRemaining / 1000)}s
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Phase Indicator */}
                  <div className="flex items-center justify-center gap-2 text-sm">
                    <div className={`w-2 h-2 rounded-full ${
                      progressUpdate.phase === 'parsing' ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'
                    }`}></div>
                    <span className={progressUpdate.phase === 'parsing' ? 'text-blue-600' : 'text-gray-500'}>
                      Parsovanie
                    </span>
                    
                    <div className={`w-2 h-2 rounded-full ${
                      progressUpdate.phase === 'processing' ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'
                    }`}></div>
                    <span className={progressUpdate.phase === 'processing' ? 'text-blue-600' : 'text-gray-500'}>
                      Spracovanie
                    </span>
                    
                    <div className={`w-2 h-2 rounded-full ${
                      progressUpdate.phase === 'inserting' ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'
                    }`}></div>
                    <span className={progressUpdate.phase === 'inserting' ? 'text-blue-600' : 'text-gray-500'}>
                      Vkladanie
                    </span>
                  </div>

                  {/* Errors */}
                  {progressUpdate.errors.length > 0 && (
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-3">
                      <div className="text-sm text-yellow-800 dark:text-yellow-200 font-medium mb-1">
                        Upozornenia ({progressUpdate.errors.length})
                      </div>
                      <div className="text-xs text-yellow-700 dark:text-yellow-300 max-h-24 overflow-y-auto">
                        {progressUpdate.errors.slice(0, 5).map((error, index) => (
                          <div key={index}>{error}</div>
                        ))}
                        {progressUpdate.errors.length > 5 && (
                          <div>... a {progressUpdate.errors.length - 5} ďalších</div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Loading spinner if no progress yet */}
              {!progressUpdate && (
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-400">Pripravujem import...</p>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Result */}
          {step === 'result' && importResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-6 w-6 text-green-500" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                  Import dokončený
                </h3>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 space-y-2">
                <p><strong>Celkový počet riadkov:</strong> {importResult.totalRows}</p>
                <p><strong>Úspešne importované:</strong> {importResult.successfulRows}</p>
                <p><strong>Chyby:</strong> {importResult.errors.length}</p>
                <p><strong>Trvanie:</strong> {(importResult.duration / 1000).toFixed(1)}s</p>
              </div>

              {importResult.errors.length > 0 && (
                <div className="max-h-40 overflow-y-auto bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                  <h4 className="font-medium text-red-800 dark:text-red-400 mb-2">Chyby:</h4>
                  <ul className="text-sm text-red-700 dark:text-red-300 space-y-1">
                    {importResult.errors.slice(0, 10).map((error, index) => (
                      <li key={index}>• {error}</li>
                    ))}
                    {importResult.errors.length > 10 && (
                      <li>... a {importResult.errors.length - 10} ďalších</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="flex justify-end">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
                >
                  Zavrieť
                </button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-4 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
              <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

