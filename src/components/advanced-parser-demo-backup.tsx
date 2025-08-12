'use client';

import { useState } from 'react';
import { AdvancedParser } from '@/lib/parser/advanced-parser';
import { ParsedRecord, RawRecord } from '@/lib/parser/types';

export function AdvancedParserDemo() {
  const [input, setInput] = useState('JAROŠ Štefan (ž.Marta Virdzeková zomrel 24.04.1997)');
  const [result, setResult] = useState<ParsedRecord | null>(null);
  const [parser] = useState(() => new AdvancedParser());

  const handleParse = () => {
    const rawRecord: RawRecord = {
      k_uzemie: 'Sabinov',
      poradie: '854212',
      lv: '4173',
      meno_raw: input
    };

    const parsed = parser.parseRecord(rawRecord);
    setResult(parsed);
  };

  const testCases = [
    'Batóová Júlia r. Szivecová, (z Várkonyu, m.Ján)',
    'JAROŠ Štefan (ž.Marta Virdzeková zomrel 24.04.1997)',
    'Molnárová Irena r. Kocsisová, (vd., muž Ján felsö)',
    'PETRIĽAK Vasiľ (maloletý)',
    'Novotná Mária (nar. 8.9.1898, z.23.7.1971, bytom Sabinov)',
    'Slovenská republika – v správe SPF'
  ];

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Pokročilý Parser - Demo (Záloha)</h1>
      
      {/* Input sekcia */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          Testovací vstup (meno_raw):
        </label>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            placeholder="Zadajte meno na parsovanie..."
          />
          <button
            onClick={handleParse}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md transition-colors"
          >
            Parsovať
          </button>
        </div>
        
        {/* Rýchle test cases */}
        <div className="flex flex-wrap gap-2">
          {testCases.map((testCase, index) => (
            <button
              key={index}
              onClick={() => setInput(testCase)}
              className="px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded"
            >
              Test {index + 1}
            </button>
          ))}
        </div>
      </div>

      {/* Výsledky */}
      {result && (
        <div className="space-y-6">
          {/* Prehľad */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold mb-3">Prehľad</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-600 dark:text-gray-400">Parse Score:</span>
                <div className={`font-semibold ${result.parse_score >= 0.8 ? 'text-green-600' : result.parse_score >= 0.6 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {(result.parse_score * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">Pohlavie:</span>
                <div className="font-semibold">{result.gender}</div>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">SPF:</span>
                <div className={`font-semibold ${result.is_spf ? 'text-blue-600' : 'text-gray-500'}`}>
                  {result.is_spf ? `Áno (${(result.spf_conf * 100).toFixed(0)}%)` : 'Nie'}
                </div>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">Chyby:</span>
                <div className={`font-semibold ${result.parse_errors ? 'text-red-600' : 'text-green-600'}`}>
                  {result.parse_errors || 'Žiadne'}
                </div>
              </div>
            </div>
          </div>

          {/* Extrahované polia */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold mb-3">Extrahované polia</h3>
            <div className="space-y-2">
              {result.given && (
                <FieldDisplay label="Krstné meno" field={result.given} />
              )}
              {result.surname && (
                <FieldDisplay label="Priezvisko" field={result.surname} />
              )}
              {result.maiden_surname && (
                <FieldDisplay label="Rodné priezvisko" field={result.maiden_surname} />
              )}
              {result.spouse_given && (
                <FieldDisplay label="Manžel/ka (meno)" field={result.spouse_given} />
              )}
              {result.spouse_surname && (
                <FieldDisplay label="Manžel/ka (priezvisko)" field={result.spouse_surname} />
              )}
              {result.status && (
                <FieldDisplay label="Status" field={result.status} />
              )}
              {result.origin_place && (
                <FieldDisplay label="Pôvod" field={result.origin_place} />
              )}
              {result.residence && (
                <FieldDisplay label="Bydlisko" field={result.residence} />
              )}
              {result.birth_place && (
                <FieldDisplay label="Miesto narodenia" field={result.birth_place} />
              )}
              {result.birth_date && (
                <FieldDisplay label="Dátum narodenia" field={result.birth_date} />
              )}
              {result.death_date && (
                <FieldDisplay label="Dátum úmrtia" field={result.death_date} />
              )}
              {result.name_suffix && (
                <FieldDisplay label="Suffix (ml./st.)" field={result.name_suffix} />
              )}
              {result.name_suffix_roman && (
                <FieldDisplay label="Suffix (rímsky)" field={result.name_suffix_roman} />
              )}
            </div>
          </div>

          {/* Meta informácie */}
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <h3 className="text-lg font-semibold mb-3">Meta informácie</h3>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-600 dark:text-gray-400">Čisté meno (pre vyhľadávanie):</span>
                <code className="ml-2 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
                  "{result.meno_clean}"
                </code>
              </div>
              
              {result.evidence_spans.length > 0 && (
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Evidence spans:</span>
                  <div className="mt-1 space-y-1">
                    {result.evidence_spans.map((span, index) => (
                      <div key={index} className="text-xs">
                        <span className="font-medium">{span.type}:</span>
                        <code className="ml-1 px-1 bg-gray-100 dark:bg-gray-700 rounded">
                          "{span.text}" [{span.span[0]}-{span.span[1]}]
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {result.notes_raw.length > 0 && (
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Poznámky (zátvorky):</span>
                  <div className="mt-1">
                    {result.notes_raw.map((note, index) => (
                      <code key={index} className="inline-block mr-2 px-2 py-1 bg-yellow-100 dark:bg-yellow-900 rounded text-xs">
                        "{note}"
                      </code>
                    ))}
                  </div>
                </div>
              )}
              
              {result.tags_raw.length > 0 && (
                <div>
                  <span className="text-gray-600 dark:text-gray-400">Nezaradené tokeny:</span>
                  <div className="mt-1">
                    {result.tags_raw.map((token, index) => (
                      <code key={index} className="inline-block mr-2 px-2 py-1 bg-red-100 dark:bg-red-900 rounded text-xs">
                        "{token}"
                      </code>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper komponent pre zobrazenie parsed field
function FieldDisplay({ label, field }: { label: string; field: any }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[140px]">
          {label}:
        </span>
        <span className="font-semibold text-gray-900 dark:text-gray-100">
          {field.value}
        </span>
        {field.uncertain && (
          <span className="text-yellow-600 text-xs">⚠️ neisté</span>
        )}
      </div>
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <span className={`px-2 py-1 rounded ${getConfidenceColor(field.confidence)}`}>
          {(field.confidence * 100).toFixed(0)}%
        </span>
        <span className="font-mono text-xs">
          {field.source_rule.replace('RULE_', '')}
        </span>
      </div>
    </div>
  );
}

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.9) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
  if (confidence >= 0.75) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
  return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
}
