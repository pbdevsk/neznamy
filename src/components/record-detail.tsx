'use client';

import { MapPin, FileText, Users, BarChart3, TrendingUp } from 'lucide-react';
import { useState, useEffect } from 'react';
import type { SearchResult, OwnerTag } from '@/lib/db';
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

interface NameStats {
  currentRecord: {
    id: number;
    meno_raw: string;
    katastralne_uzemie: string;
  };
  firstNames: { name: string; count: number }[];
  surnames: { name: string; count: number }[];
  allNames: { name: string; count: number }[];
  topLocationsBySurname: {
    surname: string;
    locations: { location: string; count: number }[];
  }[];
  familyRelations: {
    surname: string;
    relations: { type: string; name: string; count: number }[];
  }[];
  maidenNames: { maidenName: string; count: number }[];
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
  const [nameStats, setNameStats] = useState<NameStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [relationsLoading, setRelationsLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && !regionalInfo) {
      fetchRegionalInfo();
    }
    if (isOpen && !lvRelations) {
      fetchLvRelations();
    }
    if (isOpen && !nameStats) {
      fetchNameStats();
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

  const fetchNameStats = async () => {
    setStatsLoading(true);
    try {
      const response = await fetch(`/api/records/${record.id}/name-stats`);
      if (response.ok) {
        const data = await response.json();
        setNameStats(data);
      }
    } catch (error) {
      console.error('Chyba pri načítavaní štatistík mien:', error);
    } finally {
      setStatsLoading(false);
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

            {/* 5. Štatistiky mien a priezvisk */}
            <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 border border-orange-200 dark:border-orange-800">
              <h4 className="text-sm font-medium text-orange-700 dark:text-orange-300 mb-2 flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                Štatistiky mien:
              </h4>
              
              {statsLoading ? (
                <div className="text-sm text-orange-600 dark:text-orange-400">Načítavam štatistiky...</div>
              ) : nameStats ? (
                <div className="space-y-3">
                  {/* Krstné mená */}
                  {nameStats.firstNames.length > 0 && (
                    <div>
                      <h5 className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">Krstné mená:</h5>
                      <div className="flex flex-wrap gap-1">
                        {nameStats.firstNames.map((item, index) => (
                          <span key={index} className="text-xs bg-orange-100 dark:bg-orange-800 text-orange-800 dark:text-orange-200 px-2 py-1 rounded">
                            {item.name}: {item.count.toLocaleString()}x
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Priezviská */}
                  {nameStats.surnames.length > 0 && (
                    <div>
                      <h5 className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">Priezviská:</h5>
                      <div className="flex flex-wrap gap-1">
                        {nameStats.surnames.map((item, index) => (
                          <span key={index} className="text-xs bg-orange-100 dark:bg-orange-800 text-orange-800 dark:text-orange-200 px-2 py-1 rounded">
                            {item.name}: {item.count.toLocaleString()}x
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Top lokality pre priezviská */}
                  {nameStats.topLocationsBySurname.length > 0 && (
                    <div>
                      <h5 className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">Top lokality:</h5>
                      {nameStats.topLocationsBySurname.map((surnameData, index) => (
                        <div key={index} className="mb-2">
                          <div className="text-xs font-medium text-orange-700 dark:text-orange-300">
                            {surnameData.surname}:
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {surnameData.locations.slice(0, 3).map((loc, locIndex) => (
                              <span key={locIndex} className="text-xs bg-orange-200 dark:bg-orange-700 text-orange-700 dark:text-orange-300 px-2 py-1 rounded">
                                {loc.location} ({loc.count}x)
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Rodinné vzťahy */}
                  {nameStats.familyRelations.length > 0 && (
                    <div>
                      <h5 className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">Rodinné vzťahy:</h5>
                      {nameStats.familyRelations.map((familyData, index) => (
                        <div key={index} className="mb-2">
                          <div className="text-xs font-medium text-orange-700 dark:text-orange-300">
                            {familyData.surname}:
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {familyData.relations.slice(0, 3).map((rel, relIndex) => (
                              <span key={relIndex} className="text-xs bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">
                                {rel.type}: {rel.name} ({rel.count}x)
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Rodné priezviská */}
                  {nameStats.maidenNames.length > 0 && (
                    <div>
                      <h5 className="text-xs font-medium text-orange-600 dark:text-orange-400 mb-1">Rodné priezviská:</h5>
                      <div className="flex flex-wrap gap-1">
                        {nameStats.maidenNames.slice(0, 5).map((item, index) => (
                          <span key={index} className="text-xs bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-300 px-2 py-1 rounded">
                            {item.maidenName}: {item.count}x
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-orange-600 dark:text-orange-400">Štatistiky nie sú k dispozícii</div>
              )}
            </div>

          </div>
        </div>
      )}
    </>
  );
}
