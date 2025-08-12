'use client';

import { AlertTriangle, Tag, Cross } from 'lucide-react';
import type { OwnerTag } from '@/lib/db';

// Mapovanie tagov na krajšie názvy
const tagDisplayNames: Record<string, string> = {
  // Pokročilý parser tagy
  'given': 'Krstné meno',
  'surname': 'Priezvisko',
  'maiden_surname': 'Rodné priezvisko',
  'spouse_given': 'Manžel/ka',
  'spouse_surname': 'Manžel/ka (priezvisko)',
  'status': 'Stav',
  'origin_place': 'Pôvod',
  'residence': 'Bydlisko',
  'birth_place': 'Miesto narodenia',
  'birth_date': 'Dátum narodenia',
  'death_date': 'Dátum úmrtia',
  'name_suffix': 'Prípona',
  'name_suffix_roman': 'Prípona (rímska)',
  'gender': 'Pohlavie',
  'is_spf': 'SPF',
  // Meta tagy
  'parse_score': 'Skóre parsovania',
  'parse_errors': 'Chyby parsovania',
  'notes_raw': 'Poznámky',
  'tags_raw': 'Nezaradené',
  'evidence_spans': 'Dôkazy',
  'spf_reason': 'SPF dôvod',
  // Rozšírené statusy
  'maloletý': 'Maloletý',
  'maloletá': 'Maloletá',
  'mladistvý': 'Mladistvý',
  'mladistvá': 'Mladistvá',
  'vdova': 'Vdova',
  'vdovec': 'Vdovec',
  'rozvedený': 'Rozvedený',
  'rozvedená': 'Rozvedená',
  'slobodný': 'Slobodný',
  'slobodná': 'Slobodná',
  // Staré tagy (spätná kompatibilita)
  'meno': 'Meno',
  '✝️': 'Úmrtie',
  'manžel': 'Manžel',
  'manželka': 'Manželka',
  'syn': 'Syn',
  'dcéra': 'Dcéra',
  'otec': 'Otec',
  'matka': 'Matka',
  'brat': 'Brat',
  'sestra': 'Sestra',
  'dedko': 'Dedko',
  'babka': 'Babka',
  'vnuk': 'Vnuk',
  'vnučka': 'Vnučka',
  'priezvisko': 'Priezvisko',
  'krstné_meno': 'Krstné meno',
  'rodné_priezvisko': 'Rodné priezvisko',
  'stav': 'Stav',
  'pôvod': 'Pôvod',
  'poznámka': 'Poznámka'
};

function formatTagType(key: string): string {
  return tagDisplayNames[key] || key;
}

interface TagChipProps {
  tag: OwnerTag;
  onClick?: (value: string) => void;
  size?: 'sm' | 'md';
}

const tagIcons = {
  'meno': Tag,
  '✝️': Cross,
  'manžel': Tag,
  'manželka': Tag,
  'syn': Tag,
  'dcéra': Tag,
  'otec': Tag,
  'matka': Tag,
  'brat': Tag,
  'sestra': Tag,
  'dedko': Tag,
  'babka': Tag,
  'vnuk': Tag,
  'vnučka': Tag,
  'priezvisko': Tag,
  'krstné_meno': Tag,
  'rodné_priezvisko': Tag,
  'stav': Tag,
  'pôvod': Tag,
  'poznámka': Tag
};

const tagColors = {
  // Pokročilý parser tagy
  'given': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'surname': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'maiden_surname': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'spouse_given': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  'spouse_surname': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  'status': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'origin_place': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  'residence': 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  'birth_place': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  'birth_date': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  'death_date': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'name_suffix': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'name_suffix_roman': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'gender': 'bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200',
  'is_spf': 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  // Meta tagy
  'parse_score': 'bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200',
  'parse_errors': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'notes_raw': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'tags_raw': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  'evidence_spans': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'spf_reason': 'bg-violet-100 text-violet-800 dark:bg-violet-900 dark:text-violet-200',
  // Rozšírené statusy
  'maloletý': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'maloletá': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'mladistvý': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'mladistvá': 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  'vdova': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  'vdovec': 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
  'rozvedený': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'rozvedená': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'slobodný': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'slobodná': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  // Staré tagy (spätná kompatibilita)
  'meno': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  '✝️': 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200',
  'manžel': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  'manželka': 'bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200',
  'syn': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'dcéra': 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  'otec': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'matka': 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  'brat': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  'sestra': 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  'dedko': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'babka': 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  'vnuk': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  'vnučka': 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  'priezvisko': 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  'krstné_meno': 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  'rodné_priezvisko': 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  'stav': 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  'pôvod': 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
  'poznámka': 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
};

export function TagChip({ tag, onClick, size = 'md' }: TagChipProps) {
  const IconComponent = tagIcons[tag.key] || Tag; // Fallback na Tag
  const colorClass = tagColors[tag.key] || 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200'; // Fallback
  const sizeClasses = size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2.5 py-0.5 text-xs';
  
  const handleClick = () => {
    if (onClick) {
      onClick(tag.value);
    }
  };

  // Pre krížik použiť symbol namiesto ikony
  const isDeathTag = tag.key === '✝️';

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-1.5 rounded-full font-medium transition-all hover:shadow-sm ${colorClass} ${sizeClasses} ${
        onClick ? 'cursor-pointer hover:scale-105' : 'cursor-default'
      }`}
      title={`${formatTagType(tag.key)}: ${tag.value}${tag.uncertain ? ' (neisté)' : ''}${tag.confidence !== undefined ? ` - ${Math.round(tag.confidence * 100)}% istota` : ''}${tag.source_rule ? ` - ${tag.source_rule.replace('RULE_', '')}` : ''}`}
    >
      {isDeathTag ? (
        <span className="text-xs">✝️</span>
      ) : (
        <IconComponent className="h-3 w-3" />
      )}
      <span className="truncate">
        {tag.key !== 'meno' && tag.key !== '✝️' ? `${formatTagType(tag.key)}: ${tag.value}` : tag.value}
      </span>
      
      {/* Confidence score */}
      {tag.confidence !== undefined && tag.confidence < 1.0 && (
        <span className="text-xs px-1 py-0.5 bg-white/50 dark:bg-black/30 rounded">
          {Math.round(tag.confidence * 100)}%
        </span>
      )}
      
      {/* Uncertain flag */}
      {tag.uncertain && (
        <AlertTriangle className="h-3 w-3 text-yellow-600 dark:text-yellow-400 flex-shrink-0" />
      )}
    </button>
  );
}

