// Types pre pokročilý parser podľa špecifikácie

export interface ParsedField<T = string> {
  value: T;
  confidence: number;
  source_rule: string;
  span: [number, number];
  uncertain?: boolean;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface ParsedRecord {
  // Povinné polia
  k_uzemie: string;
  poradie: number | null;
  lv: number | null;
  meno_raw: string;
  meno_clean: string;

  // Extrahované polia
  given?: ParsedField<string>;
  surname?: ParsedField<string>;
  maiden_surname?: ParsedField<string>;
  spouse_given?: ParsedField<string>;
  spouse_surname?: ParsedField<string>;
  
  status?: ParsedField<'maloletý' | 'maloletá' | 'mladistvý' | 'mladistvá' | 'vdova' | 'vdovec' | 'rozvedený' | 'rozvedená' | 'slobodný' | 'slobodná'>;
  
  origin_place?: ParsedField<string>;
  residence?: ParsedField<string>;
  birth_place?: ParsedField<string>;
  
  birth_date?: ParsedField<string>; // ISO YYYY-MM-DD
  death_date?: ParsedField<string>; // ISO YYYY-MM-DD
  
  name_suffix?: ParsedField<string>; // ml./st.
  name_suffix_roman?: ParsedField<string>; // I./II./III.
  
  gender: 'muž' | 'žena' | 'neisté';
  
  is_spf: boolean;
  spf_conf: number;
  spf_reason?: 'TEXT_MATCH' | 'FIELD_MATCH';

  // Meta
  parse_score: number; // 0-1
  parse_errors: string; // CSV-safe, ; oddelené
  notes_raw: string[]; // obsah zátvoriek
  tags_raw: string[]; // nezaradené tokeny
  evidence_spans: Array<{ type: string; span: [number, number]; text: string }>;
}

export interface RawRecord {
  k_uzemie: string;
  poradie: string | number;
  lv: string | number;
  meno_raw: string;
  [key: string]: any; // pre ďalšie stĺpce
}

export interface ColumnMapping {
  k_uzemie: string;
  poradie: string;
  lv: string;
  meno_raw: string;
}

export interface ParseConfig {
  // Thresholdy
  conf_low: number;
  conf_warn: number;
  problematic_if_no_tags: boolean;

  // Aliasy pre markery
  maiden_aliases: string[];
  spouse_aliases_f: string[];
  spouse_aliases_m: string[];
  death_kw: string[];
  birth_kw: string[];
  residence_kw: string[];
  
  status_kw: {
    minor: string[];
    juvenile: string[];
    widow: string[];
    divorced: string[];
    single: string[];
  };
}

export interface ImportResult {
  records: ParsedRecord[];
  stats: {
    total_records: number;
    parsed_successfully: number;
    problematic_count: number;
    spf_count: number;
    tag_stats: Record<string, number>;
    most_common_unmatched: Array<{ pattern: string; count: number }>;
  };
  errors: string[];
}

export interface FilterState {
  search: string;
  k_uzemie: string;
  lv: string;
  only_problematic: boolean;
  only_spf: boolean;
}

export interface SortState {
  field: keyof ParsedRecord;
  direction: 'ASC' | 'DESC';
}

export enum ParseErrorCode {
  NO_MATCH = 'NO_MATCH',
  NUMERIC_INVALID = 'NUMERIC_INVALID', 
  CONFLICT_MAIDEN = 'CONFLICT_MAIDEN',
  CONFLICT_SPOUSE = 'CONFLICT_SPOUSE',
  CONFLICT_DATES = 'CONFLICT_DATES'
}

