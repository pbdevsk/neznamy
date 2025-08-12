import { ParseConfig } from './types';

export class ParseRules {
  // Regex patterns pre extrakciu
  MAIDEN: RegExp;
  SPOUSE_F: RegExp;
  SPOUSE_M: RegExp;
  STATUS_MINOR: RegExp;
  STATUS_WIDOW: RegExp;
  STATUS_DIVORCED: RegExp;
  STATUS_SINGLE: RegExp;
  ORIGIN: RegExp;
  RESIDENCE: RegExp;
  BIRTH_PL: RegExp;
  DATE: RegExp;
  BIRTH_KW: RegExp;
  DEATH_KW: RegExp;
  SUFFIX_MLST: RegExp;
  SUFFIX_ROMAN: RegExp;
  SPF: RegExp;

  constructor(config: ParseConfig) {
    // Rodné priezvisko - r. Nováková, rod. Svobodová, rodená Krásna
    this.MAIDEN = new RegExp(
      `\\b(?:${config.maiden_aliases.join('|')})\\s+([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záäčďéíĺľňóôŕšťúýž]+(?:ová|ná|á)?)\\b`,
      'gi'
    );

    // Manželka - ž. Mária Nová, žena Ema
    this.SPOUSE_F = new RegExp(
      `\\b(?:${config.spouse_aliases_f.join('|')})\\s+([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záäčďéíĺľňóôŕšťúýž]+)(?:\\s+([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záäčďéíĺľňóôŕšťúýž]+(?:ová|ná|á)?))?\\b`,
      'gi'
    );

    // Manžel - m. Ján Nový, muž Peter
    this.SPOUSE_M = new RegExp(
      `\\b(?:${config.spouse_aliases_m.join('|')})\\s+([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záäčďéíĺľňóôŕšťúýž]+)(?:\\s+([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záäčďéíĺľňóôŕšťúýž]+))?\\b`,
      'gi'
    );

    // Status - maloletý/á
    this.STATUS_MINOR = new RegExp(
      `\\b(${config.status_kw.minor.join('|')})\\b`,
      'gi'
    );

    // Status - vdova/vdovec
    this.STATUS_WIDOW = new RegExp(
      `\\b(${config.status_kw.widow.join('|')})\\b`,
      'gi'
    );

    // Status - rozvedený/á
    this.STATUS_DIVORCED = new RegExp(
      `\\b(${config.status_kw.divorced.join('|')})\\b`,
      'gi'
    );

    // Status - slobodný/á
    this.STATUS_SINGLE = new RegExp(
      `\\b(${config.status_kw.single.join('|')})\\b`,
      'gi'
    );

    // Pôvod - z obce XY, pôvodom z
    this.ORIGIN = new RegExp(
      `\\b(?:z\\s+obce|pôvodom\\s+z|z)\\s+([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záäčďéíĺľňóôŕšťúýž\\s]+?)(?:\\s|$|,|\\)|;)`,
      'gi'
    );

    // Bydlisko - byt. v, bytom v, s bydliskom
    this.RESIDENCE = new RegExp(
      `\\b(?:${config.residence_kw.join('|')})\\s+([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záäčďéíĺľňóôŕšťúýž\\s]+?)(?:\\s|$|,|\\)|;)`,
      'gi'
    );

    // Miesto narodenia - nar. v, narodený v
    this.BIRTH_PL = new RegExp(
      `\\b(?:nar\\.|narodený|narodená)\\s+v\\s+([A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záäčďéíĺľňóôŕšťúýž\\s]+?)(?:\\s|$|,|\\)|;)`,
      'gi'
    );

    // Dátumy - DD.MM.YYYY, DD/MM/YYYY
    this.DATE = /\b(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})\b/g;

    // Kľúčové slová pre narodenie
    this.BIRTH_KW = new RegExp(
      `\\b(?:${config.birth_kw.join('|')})\\b`,
      'gi'
    );

    // Kľúčové slová pre úmrtie
    this.DEATH_KW = new RegExp(
      `\\b(?:${config.death_kw.join('|')})\\b`,
      'gi'
    );

    // Suffixy - ml., st.
    this.SUFFIX_MLST = /\b(ml\.|st\.)\b/gi;

    // Rímske číslice - I., II., III.
    this.SUFFIX_ROMAN = /\b([IVX]+\.)\b/g;

    // SPF detekcia
    this.SPF = /\b(?:slovenský\s+pozemkový\s+fond|spf|s\.p\.f\.)\b/gi;
  }
}

export const DEFAULT_PARSE_CONFIG: ParseConfig = {
  // Thresholdy
  conf_low: 0.3,
  conf_warn: 0.6,
  problematic_if_no_tags: true,

  // Aliasy pre markery
  maiden_aliases: ['r\\.', 'rod\\.', 'rodená', 'rodenej', 'rodnej'],
  spouse_aliases_f: ['ž\\.', 'žena', 'manželka', 'manž\\.'],
  spouse_aliases_m: ['m\\.', 'muž', 'manžel', 'manž\\.'],
  
  death_kw: ['zomrel', 'zomrela', '†', '\\+', 'úmrtie', 'úmrtí', 'zem\\.',  'zemr\\.'],
  birth_kw: ['narodený', 'narodená', 'nar\\.', 'narodenie', 'pôrod'],
  residence_kw: ['byt\\.', 'bytom', 's\\s+bydliskom', 'bydliskom', 'býva'],

  status_kw: {
    minor: ['maloletý', 'maloletá', 'mladistvý', 'mladistvá'],
    juvenile: ['mladistvý', 'mladistvá'],
    widow: ['vdova', 'vdovec'],
    divorced: ['rozvedený', 'rozvedená', 'rozveden[áý]'],
    single: ['slobodný', 'slobodná', 'nevydatá', 'neženatý']
  }
};
