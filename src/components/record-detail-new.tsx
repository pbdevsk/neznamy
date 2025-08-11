'use client';

import { MapPin, FileText, Search, Users } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { SearchResult, OwnerTag } from '@/lib/db';
import { createGoogleSearchUrl, createGoogleSearchDescription, isGoogleSearchAvailable } from '@/lib/google-search';
import { ManualTags } from './manual-tags';
import { TagChip } from './tag-chip';

interface RegionalInfo {
  region_name: string;
  region_shortcut: string;
  district_name: string;
  district_vehicle_registration: string;
  village_name?: string;
  village_zip?: string;
}

interface LvRelation {
  id: number;
  meno_raw: string;
  poradie: string;
  tags: OwnerTag[];
}

interface LvRelationsData {
  currentRecord: {
    id: number;
    meno_raw: string;
    lv: string;
    katastralne_uzemie: string;
    poradie: string;
  };
  relations: LvRelation[];
  totalCount: number;
}

interface RecordDetailProps {
  record: SearchResult;
  isOpen: boolean;
  onToggle: () => void;
  onSearch?: (query: string) => void;
}

export function RecordDetail({ record, isOpen, onToggle, onSearch }: RecordDetailProps) {
  const [regionalInfo, setRegionalInfo] = useState<RegionalInfo | null>(null);
  const [lvRelations, setLvRelations] = useState<LvRelationsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [relationsLoading, setRelationsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && !regionalInfo) {
      fetchRegionalInfo();
    }
    if (isOpen && !lvRelations) {
      fetchLvRelations();
    }
  }, [isOpen, record.id]);

  const fetchRegionalInfo = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/records/${record.id}/regional-info`);
      if (response.ok) {
        const data = await response.json();
        setRegionalInfo(data);
      }
    } catch (error) {
      console.error('Chyba pri načítavaní regionálnych údajov:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLvRelations = async () => {
    setRelationsLoading(true);
    try {
      const response = await fetch(`/api/records/${record.id}/lv-relations`);
      if (response.ok) {
        const data = await response.json();
        setLvRelations(data);
      }
    } catch (error) {
      console.error('Chyba pri načítavaní LV vzťahov:', error);
    } finally {
      setRelationsLoading(false);
    }
  };

  const handleNameClick = (name: string) => {
    if (onSearch) {
      const cleanName = name.replace(/\s*\(.*?\)\s*/g, '').replace(/\s+r\.\s*\S+.*$/, '').trim();
      onSearch(cleanName);
    }
  };

  return (
    <>
      {/* Rozbalený obsah */}
      {isOpen && (
        <div className="border-t-2 border-blue-200 dark:border-blue-700 bg-gradient-to-r from-blue-50/50 to-transparent dark:from-blue-900/10 dark:to-transparent">
          <div className="px-6 py-4 space-y-3 animate-in slide-in-from-top-2 duration-300">
            
            {/* 1. Pôvodný text z CSV */}
            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 border border-gray-200 dark:border-gray-700">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Pôvodný záznam:
              </h4>
              <div className="bg-white dark:bg-gray-900 rounded border px-3 py-2 font-mono text-sm text-gray-800 dark:text-gray-200 break-all">
                {record.meno_raw}
              </div>
            </div>

            {/* 2. Rozparsované tagy */}
            {(() => {
              const nonNameTags = record.tags?.filter(tag => tag.key !== 'meno') || [];
              return nonNameTags.length > 0 && (
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 border border-purple-200 dark:border-purple-800">
                  <h4 className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-2">
                    <span className="h-4 w-4 bg-purple-600 dark:bg-purple-400 rounded-full flex items-center justify-center">
                      <span className="text-xs text-white font-bold">#</span>
                    </span>
                    Rozparsované údaje:
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {nonNameTags.map((tag, index) => (
                      <TagChip
                        key={index}
                        tag={tag}
                        size="sm"
                      />
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* 3. Lokalita - kompaktné */}
            <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
              <h4 className="text-sm font-medium text-blue-700 dark:text-blue-300 mb-2 flex items-center gap-2">
                <MapPin className="h-4 w-4" />
                Lokalita:
              </h4>
              <div className="text-sm text-blue-900 dark:text-blue-100 space-y-1">
                <div>
                  <strong>KÚ:</strong> {record.katastralne_uzemie} | 
                  <strong> LV:</strong> {record.lv} | 
                  <strong> Por.:</strong> {record.poradie.toLocaleString()}
                </div>
                {loading ? (
                  <div className="text-blue-600 dark:text-blue-400">Načítavam regionálne údaje...</div>
                ) : regionalInfo ? (
                  <div>
                    <strong>Región:</strong> {regionalInfo.region_name} ({regionalInfo.region_shortcut}) → 
                    <strong> Okres:</strong> {regionalInfo.district_name} ({regionalInfo.district_vehicle_registration})
                    {regionalInfo.village_name && (
                      <> → <strong>Obec:</strong> {regionalInfo.village_name}</>
                    )}
                  </div>
                ) : (
                  <div className="text-yellow-600 dark:text-yellow-400">Regionálne údaje nedostupné</div>
                )}
              </div>
            </div>

            {/* 4. Ľudia na rovnakom LV - kompaktne */}
            <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 border border-green-200 dark:border-green-800">
              <h4 className="text-sm font-medium text-green-700 dark:text-green-300 mb-2 flex items-center gap-2">
                <Users className="h-4 w-4" />
                Ľudia na LV {record.lv}:
              </h4>
              
              {relationsLoading ? (
                <div className="text-sm text-green-600 dark:text-green-400">Načítavam...</div>
              ) : lvRelations && lvRelations.relations.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs text-green-600 dark:text-green-400">
                    Celkom: {lvRelations.totalCount} osôb
                  </div>
                  <div className="space-y-1">
                    {lvRelations.relations.slice(0, 5).map((relation) => (
                      <div key={relation.id} className="text-sm">
                        <button
                          onClick={() => handleNameClick(relation.meno_raw)}
                          className="text-green-800 dark:text-green-200 hover:text-green-600 dark:hover:text-green-400 underline font-medium"
                        >
                          {relation.meno_raw}
                        </button>
                        <span className="text-green-600 dark:text-green-400 text-xs ml-2">
                          (por. {relation.poradie})
                        </span>
                      </div>
                    ))}
                    {lvRelations.relations.length > 5 && (
                      <div className="text-xs text-green-600 dark:text-green-400">
                        ... a ďalších {lvRelations.relations.length - 5} osôb
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-green-600 dark:text-green-400">Žiadni ďalší ľudia na tomto LV</div>
              )}
            </div>

            {/* 5. Google vyhľadávanie - kompaktne */}
            {(() => {
              const googleUrl = createGoogleSearchUrl(record.meno_raw, record.katastralne_uzemie);
              const isAvailable = isGoogleSearchAvailable(record.meno_raw);
              
              return (
                <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800">
                  <h4 className="text-sm font-medium text-emerald-700 dark:text-emerald-300 mb-2 flex items-center gap-2">
                    <Search className="h-4 w-4" />
                    Google vyhľadávanie:
                  </h4>
                  {isAvailable && googleUrl ? (
                    <a
                      href={googleUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 px-3 py-1 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600 text-white text-sm font-medium rounded transition-colors"
                    >
                      <Search className="h-3 w-3" />
                      Hľadať na Google
                    </a>
                  ) : (
                    <div className="text-sm text-emerald-600 dark:text-emerald-400">Nedostupné</div>
                  )}
                </div>
              );
            })()}

            {/* 6. Manuálne tagy */}
            <ManualTags ownerId={record.id} />
          </div>
        </div>
      )}
    </>
  );
}
