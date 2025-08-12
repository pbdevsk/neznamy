import { ParsedRecord, RawRecord, ParsedField, ParseErrorCode } from './types';
import { isGivenName } from '../given-names';
import { formatName } from '../normalize';
import { ParseRules, DEFAULT_PARSE_CONFIG } from './rules-config';

interface ParsingContext {
  originalText: string;
  head: string;
  parens: string[];
  tail: string;
  tags: Array<ParsedField & { type: string }>;
  errors: ParseErrorCode[];
  notes: string[];
  unmatched: string[];
}

export class AdvancedParser {
  private rules: ParseRules;

  constructor() {
    this.rules = new ParseRules(DEFAULT_PARSE_CONFIG);
  }

  /**
   * Hlavná funkcia pre parsing záznamu
   */
  parseRecord(raw: RawRecord): ParsedRecord {
    // Základné polia
    const result: ParsedRecord = {
      k_uzemie: raw.k_uzemie?.toString().trim() || '',
      poradie: this.parseNumber(raw.poradie),
      lv: this.parseNumber(raw.lv),
      meno_raw: raw.meno_raw?.toString().trim() || '',
      meno_clean: this.createCleanName(raw.meno_raw?.toString() || ''),
      gender: 'neisté',
      is_spf: false,
      spf_conf: 0,
      parse_score: 0,
      parse_errors: '',
      notes_raw: [],
      tags_raw: [],
      evidence_spans: []
    };

    if (!result.meno_raw) {
      result.parse_errors = ParseErrorCode.NO_MATCH;
      return result;
    }

    // Parsing kontext
    const ctx = this.createParsingContext(result.meno_raw);
    
    // Pass 1: Extrakcia markerov z head
    this.extractMarkersFromSegment(ctx, ctx.head, 'head');
    
    // Pass 2: Extrakcia markerov z každej zátvorky
    ctx.parens.forEach((paren, index) => {
      this.extractMarkersFromSegment(ctx, paren, `paren_${index}`);
    });

    // Pass 3: Heuristické rozdelenie mena z head
    this.extractNameHeuristic(ctx);

    // Pass 4: Gender inference
    this.inferGender(ctx);

    // Pass 5: SPF detekcia
    this.detectSPF(ctx, raw);

    // Pass 6: Detekcia konfliktov a scoring
    this.detectConflicts(ctx);
    const score = this.calculateScore(ctx);

    // Naplnenie výsledku
    this.fillResultFromTags(result, ctx);
    result.parse_score = score;
    result.parse_errors = ctx.errors.join(';');
    result.notes_raw = ctx.notes;
    result.tags_raw = ctx.unmatched;

    return result;
  }

  /**
   * Vytvorenie parsing kontextu - segmentácia textu
   */
  private createParsingContext(text: string): ParsingContext {
    // Segmentácia: head, parens[], tail
    const parenRegex = /\([^)]*\)/g;
    const parens: string[] = [];
    let match;
    
    while ((match = parenRegex.exec(text)) !== null) {
      parens.push(match[0].slice(1, -1)); // bez zátvoriek
    }

    const firstParenIndex = text.indexOf('(');
    const head = firstParenIndex !== -1 ? text.substring(0, firstParenIndex).trim() : text;
    
    const lastParenIndex = text.lastIndexOf(')');
    const tail = lastParenIndex !== -1 && lastParenIndex < text.length - 1 
      ? text.substring(lastParenIndex + 1).trim() 
      : '';

    return {
      originalText: text,
      head,
      parens,
      tail,
      tags: [],
      errors: [],
      notes: [],
      unmatched: []
    };
  }

  /**
   * Extrakcia markerov z daného segmentu
   */
  private extractMarkersFromSegment(ctx: ParsingContext, segment: string, source: string) {
    const startOffset = ctx.originalText.indexOf(segment);

    // Rodné priezvisko
    this.extractWithRegex(ctx, segment, this.rules.MAIDEN, 'maiden_surname', 2, source, startOffset);

    // Manželka
    this.extractSpouse(ctx, segment, this.rules.SPOUSE_F, 'spouse_f', source, startOffset);

    // Manžel  
    this.extractSpouse(ctx, segment, this.rules.SPOUSE_M, 'spouse_m', source, startOffset);

    // Statusy
    this.extractWithRegex(ctx, segment, this.rules.STATUS_MINOR, 'status_minor', 1, source, startOffset);
    this.extractWithRegex(ctx, segment, this.rules.STATUS_WIDOW, 'status_widow', 1, source, startOffset);
    this.extractWithRegex(ctx, segment, this.rules.STATUS_DIVORCED, 'status_divorced', 1, source, startOffset);
    this.extractWithRegex(ctx, segment, this.rules.STATUS_SINGLE, 'status_single', 1, source, startOffset);

    // Pôvod a bydlisko
    this.extractWithRegex(ctx, segment, this.rules.ORIGIN, 'origin_place', 1, source, startOffset);
    this.extractWithRegex(ctx, segment, this.rules.RESIDENCE, 'residence', 2, source, startOffset);
    this.extractWithRegex(ctx, segment, this.rules.BIRTH_PL, 'birth_place', 1, source, startOffset);

    // Dátumy s kontextom
    this.extractDatesWithContext(ctx, segment, source, startOffset);

    // Suffixy
    this.extractWithRegex(ctx, segment, this.rules.SUFFIX_MLST, 'name_suffix', 1, source, startOffset);
    this.extractWithRegex(ctx, segment, this.rules.SUFFIX_ROMAN, 'name_suffix_roman', 1, source, startOffset);
  }

  /**
   * Extrakcia s regex - generická funkcia
   */
  private extractWithRegex(
    ctx: ParsingContext, 
    text: string, 
    regex: RegExp, 
    type: string, 
    valueGroup: number,
    source: string,
    offset: number = 0
  ) {
    const match = text.match(regex);
    if (match && match[valueGroup]) {
      const value = match[valueGroup].trim();
      const span: [number, number] = [
        offset + (match.index || 0),
        offset + (match.index || 0) + match[0].length
      ];

      ctx.tags.push({
        type,
        value: type === 'maiden_surname' ? formatName(value) : value,
        confidence: 1.0,
        source_rule: `RULE_${type.toUpperCase()}`,
        span
      });
    }
  }

  /**
   * Extrakcia manžela/manželky (špecifická logika)
   */
  private extractSpouse(
    ctx: ParsingContext,
    text: string,
    regex: RegExp,
    type: string,
    source: string,
    offset: number = 0
  ) {
    const match = text.match(regex);
    if (match) {
      const givenName = match[2]?.trim();
      const surname = match[3]?.trim();
      
      if (givenName) {
        const span: [number, number] = [
          offset + (match.index || 0),
          offset + (match.index || 0) + match[0].length
        ];

        ctx.tags.push({
          type: 'spouse_given',
          value: this.formatName(givenName),
          confidence: 1.0,
          source_rule: `RULE_${type.toUpperCase()}`,
          span
        });

        if (surname) {
          ctx.tags.push({
            type: 'spouse_surname', 
            value: this.formatName(surname),
            confidence: surname.toLowerCase() === surname ? 0.8 : 0.9, // nižšia confidence pre lowercase
            source_rule: `RULE_${type.toUpperCase()}`,
            span
          });
        }
      }
    }
  }

  /**
   * Extrakcia dátumov s kontextom
   */
  private extractDatesWithContext(ctx: ParsingContext, text: string, source: string, offset: number = 0) {
    const dateMatches = [...text.matchAll(this.rules.DATE)];
    
    for (const dateMatch of dateMatches) {
      if (!dateMatch.index) continue;
      
      const day = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]);
      const year = parseInt(dateMatch[3]);
      
      // Validácia dátumu
      if (day < 1 || day > 31 || month < 1 || month > 12) continue;
      if (year < 100) continue; // potrebujeme 4-miestny rok
      
      const isoDate = `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
      
      // Hľadanie kontextu pre typ dátumu - prioritizujeme najbližší kontext
      const beforeText = text.substring(Math.max(0, dateMatch.index - 15), dateMatch.index);
      const afterText = text.substring(dateMatch.index + dateMatch[0].length, Math.min(text.length, dateMatch.index + dateMatch[0].length + 10));
      
      let dateType = 'unknown_date';
      let confidence = 0.7;
      
      // Test najbližšieho kontextu pred dátumom (priorita)
      if (this.rules.BIRTH_KW.test(beforeText)) {
        dateType = 'birth_date';
        confidence = 1.0;
      } else if (this.rules.DEATH_KW.test(beforeText)) {
        dateType = 'death_date';
        confidence = 1.0;
      } else {
        // Fallback na širší kontext
        const widerContext = text.substring(Math.max(0, dateMatch.index - 30), Math.min(text.length, dateMatch.index + dateMatch[0].length + 15));
        
        if (this.rules.BIRTH_KW.test(widerContext)) {
          dateType = 'birth_date';
          confidence = 0.9; // nižšia confidence pre vzdialený kontext
        } else if (this.rules.DEATH_KW.test(widerContext)) {
          dateType = 'death_date';
          confidence = 0.9;
        }
      }
      
      const span: [number, number] = [
        offset + dateMatch.index,
        offset + dateMatch.index + dateMatch[0].length
      ];

      ctx.tags.push({
        type: dateType,
        value: isoDate,
        confidence,
        source_rule: `RULE_${dateType.toUpperCase()}_CONTEXT`,
        span
      });
    }
  }

  /**
   * Heuristické rozdelenie mena
   */
  private extractNameHeuristic(ctx: ParsingContext) {
    // Vytvoríme čistý head bez markerov - ale opatrne!
    let cleanHead = ctx.head;
    
    // Najprv odoberie iba samostatné markery (nie celé vzory)
    cleanHead = cleanHead.replace(/\br\.\s*/gi, '');
    cleanHead = cleanHead.replace(/\bž\.\s*/gi, '');
    cleanHead = cleanHead.replace(/\bm\.\s*/gi, '');
    cleanHead = cleanHead.replace(/\brod\.\s*/gi, '');
    cleanHead = cleanHead.replace(/\bman\.\s*/gi, '');
    
    // Odstránime čiarky a text za nimi (obsahujú rodné priezvisko a iné info)
    const commaIndex = cleanHead.indexOf(',');
    if (commaIndex !== -1) {
      cleanHead = cleanHead.substring(0, commaIndex);
    }
    
    // KRITICKÁ OPRAVA: Odstránenie už extrahovaného rodného priezviska VRÁTANE MARKERA
    // Ak už máme maiden_surname tag, odstránime ho z cleanHead
    const maidenTags = ctx.tags.filter(t => t.type === 'maiden_surname');
    if (maidenTags.length > 0) {
      // Odstráň celé rodné priezvisko vrátane markera (r. Banášová, rod. Svobodová, atď.)
      const maidenPatterns = [
        /\br\.\s+[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záäčďéíĺľňóôŕšťúýž]+(?:ová|ná|á)?/gi,
        /\brod\.\s+[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záäčďéíĺľňóôŕšťúýž]+(?:ová|ná|á)?/gi,
        /\brodená\s+[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záäčďéíĺľňóôŕšťúýž]+(?:ová|ná|á)?/gi,
        /\brodenej\s+[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záäčďéíĺľňóôŕšťúýž]+(?:ová|ná|á)?/gi,
        /\brodnej\s+[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záäčďéíĺľňóôŕšťúýž]+(?:ová|ná|á)?/gi
      ];
      
      for (const pattern of maidenPatterns) {
        cleanHead = cleanHead.replace(pattern, '');
      }
      
      // Vyčistíme viacnásobné medzery
      cleanHead = cleanHead.replace(/\s+/g, ' ').trim();
    }
    
    const tokens = cleanHead.trim().split(/\s+/).filter(t => t.length > 0);
    
    if (tokens.length === 0) return;
    
    let given = '';
    let surname = '';
    let confidence = 0.6;
    
    if (tokens.length === 1) {
      // Jeden token - pravdepodobne priezvisko
      surname = tokens[0];
      confidence = 0.4;
    } else if (tokens.length === 2) {
      // Dva tokeny - najčastejší prípad
      // Slovenská konvencia: ak prvý token je ALLCAPS → priezvisko prvé
      // ak druhý token končí na -ová/-á → je to priezvisko
      if (this.isAllCaps(tokens[0]) && !this.isAllCaps(tokens[1])) {
        // "BATÓOVÁ Júlia" → BATÓOVÁ = priezvisko, Júlia = meno
        surname = tokens[0];
        given = tokens[1];
        confidence = 0.8;
      } else if (tokens[0].toLowerCase().endsWith('ová') || tokens[0].toLowerCase().endsWith('ná')) {
        // "Batóová Júlia" alebo "Novotná Mária" → priezvisko = prvý token, meno = druhý token
        surname = tokens[0];
        given = tokens[1];
        confidence = 0.8;
      } else if (tokens[1].toLowerCase().endsWith('ová') || tokens[1].toLowerCase().endsWith('ná')) {
        // "Júlia Batóová" → Batóová = priezvisko, Júlia = meno  
        given = tokens[0];
        surname = tokens[1];
        confidence = 0.8;
      } else if (this.isAllCaps(tokens[1]) && !this.isAllCaps(tokens[0])) {
        // "Júlia BATÓOVÁ" → BATÓOVÁ = priezvisko, Júlia = meno
        given = tokens[0];
        surname = tokens[1];
        confidence = 0.8;
      } else {
        // OPRAVENÝ FALLBACK: použijeme slovník krstných mien
        if (isGivenName(tokens[0]) && !isGivenName(tokens[1])) {
          // Prvý token je krstné meno, druhý nie → "Meno Priezvisko"
          given = tokens[0];
          surname = tokens[1];
          confidence = 0.85; // vyššia confidence pre dictionary match
        } else if (isGivenName(tokens[1]) && !isGivenName(tokens[0])) {
          // Druhý token je krstné meno, prvý nie → "Priezvisko Meno"
          surname = tokens[0];
          given = tokens[1];
          confidence = 0.85; // vyššia confidence pre dictionary match
        } else if (isGivenName(tokens[0]) && isGivenName(tokens[1])) {
          // Oba sú krstné mená → pravdepodobne "Meno1 Meno2", prvé je primárne
          given = tokens[0];
          surname = tokens[1]; // druhé meno ako "priezvisko"
          confidence = 0.7;
        } else {
          // Ani jeden nie je v slovníku → fallback na pozíciu (slovenská konvencia: Priezvisko Meno)
          surname = tokens[0];
          given = tokens[1];
          confidence = 0.6;
        }
      }
    } else {
      // Viac tokenov - komplexnejšia heuristika
      // Hľadáme ALLCAPS token alebo token končiaci na -ová/-á
      let surnameIndex = -1;
      
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i];
        if (this.isAllCaps(token) || 
            token.toLowerCase().endsWith('ová') || 
            token.toLowerCase().endsWith('ná')) {
          surnameIndex = i;
          break;
        }
      }
      
      if (surnameIndex !== -1) {
        // Našli sme pravdepodobné priezvisko
        surname = tokens[surnameIndex];
        const remainingTokens = [...tokens];
        remainingTokens.splice(surnameIndex, 1);
        given = remainingTokens.join(' ');
        confidence = 0.7;
      } else {
        // Fallback: posledný = priezvisko, ostatné = meno
        surname = tokens[tokens.length - 1];
        given = tokens.slice(0, -1).join(' ');
        confidence = 0.5;
      }
    }
    
    if (given) {
      ctx.tags.push({
        type: 'given',
        value: formatName(given),
        confidence,
        source_rule: 'RULE_NAME_HEURISTIC',
        span: [0, ctx.head.length]
      });
    }
    
    if (surname) {
      ctx.tags.push({
        type: 'surname',
        value: formatName(surname),
        confidence,
        source_rule: 'RULE_NAME_HEURISTIC', 
        span: [0, ctx.head.length]
      });
    }
  }

  /**
   * Pomocná funkcia pre detekciu ALLCAPS
   */
  private isAllCaps(text: string): boolean {
    return text === text.toUpperCase() && text !== text.toLowerCase() && /[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ]/.test(text);
  }

  /**
   * Formátovanie mena - prvé písmeno veľké, ostatné malé
   */
  private formatName(text: string): string {
    if (!text) return text;
    
    // Rozdelíme na slová a každé slovo naformátujeme
    return text.split(/\s+/).map(word => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }).join(' ');
  }

  /**
   * Inferencja pohlavia
   */
  private inferGender(ctx: ParsingContext) {
    let gender: 'muž' | 'žena' | 'neisté' = 'muž'; // ZMENA: Default je muž namiesto neisté
    let confidence = 0.6; // Základná confidence pre mužské pohlavie
    
    // Markery pohlavia z manželských väzieb (najvyššia priorita)
    if (ctx.tags.some(t => t.type === 'spouse_f' || t.type === 'status_minor' && t.value === 'maloletá')) {
      gender = 'žena';
      confidence = 0.9;
    } else if (ctx.tags.some(t => t.type === 'spouse_m' || t.type === 'status_minor' && t.value === 'maloletý')) {
      gender = 'muž';
      confidence = 0.9;
    } else {
      // Heuristika z priezviska - ženské koncovky prepisujú default
      const surnameTag = ctx.tags.find(t => t.type === 'surname');
      if (surnameTag) {
        const surname = surnameTag.value.toLowerCase();
        if (surname.endsWith('ová') || surname.endsWith('ná')) {
          gender = 'žena';
          confidence = 0.8;
        } else {
          // Ak priezvisko nie je ženské, zostáva mužské s default confidence
          gender = 'muž';
          confidence = 0.6;
        }
      }
    }
    
    ctx.tags.push({
      type: 'gender',
      value: gender,
      confidence,
      source_rule: 'RULE_GENDER_INFERENCE',
      span: [0, 0]
    });
  }

  /**
   * Detekcia SPF
   */
  private detectSPF(ctx: ParsingContext, raw: RawRecord) {
    let isSpf = false;
    let spfConf = 0;
    let spfReason: 'TEXT_MATCH' | 'FIELD_MATCH' | undefined;
    
    // Hľadanie v meno_raw
    if (this.rules.SPF.test(ctx.originalText)) {
      isSpf = true;
      spfConf = ctx.originalText.toLowerCase().includes('slovenský pozemkový fond') ? 1.0 : 0.8;
      spfReason = 'TEXT_MATCH';
    }
    
    // Hľadanie v iných poliach
    for (const [key, value] of Object.entries(raw)) {
      if (key !== 'meno_raw' && typeof value === 'string') {
        if (this.rules.SPF.test(value)) {
          isSpf = true;
          spfConf = Math.max(spfConf, 0.9);
          spfReason = 'FIELD_MATCH';
        }
      }
    }
    
    ctx.tags.push({
      type: 'is_spf',
      value: isSpf.toString(),
      confidence: spfConf,
      source_rule: 'RULE_SPF_DETECTION',
      span: [0, 0]
    });
    
    if (spfReason) {
      ctx.tags.push({
        type: 'spf_reason',
        value: spfReason,
        confidence: spfConf,
        source_rule: 'RULE_SPF_DETECTION',
        span: [0, 0]
      });
    }
  }

  /**
   * Detekcia konfliktov
   */
  private detectConflicts(ctx: ParsingContext) {
    // Konflikty v rodnom priezvisku
    const maidenTags = ctx.tags.filter(t => t.type === 'maiden_surname');
    if (maidenTags.length > 1) {
      const uniqueValues = new Set(maidenTags.map(t => t.value));
      if (uniqueValues.size > 1) {
        ctx.errors.push(ParseErrorCode.CONFLICT_MAIDEN);
        maidenTags.forEach(tag => {
          tag.confidence = 0.5;
          tag.uncertain = true;
        });
      }
    }
    
    // Konflikty v manželovi/manželke
    const spouseGivenTags = ctx.tags.filter(t => t.type === 'spouse_given');
    if (spouseGivenTags.length > 1) {
      const uniqueValues = new Set(spouseGivenTags.map(t => t.value));
      if (uniqueValues.size > 1) {
        ctx.errors.push(ParseErrorCode.CONFLICT_SPOUSE);
        spouseGivenTags.forEach(tag => {
          tag.confidence = 0.5;
          tag.uncertain = true;
        });
      }
    }
    
    // Konflikty v dátumoch
    const birthTag = ctx.tags.find(t => t.type === 'birth_date');
    const deathTag = ctx.tags.find(t => t.type === 'death_date');
    
    if (birthTag && deathTag) {
      const birthDate = new Date(birthTag.value);
      const deathDate = new Date(deathTag.value);
      
      if (birthDate >= deathDate) {
        ctx.errors.push(ParseErrorCode.CONFLICT_DATES);
        birthTag.uncertain = true;
        deathTag.uncertain = true;
      }
    }
  }

  /**
   * Výpočet skóre
   */
  private calculateScore(ctx: ParsingContext): number {
    if (ctx.tags.length === 0) return 0;
    
    // Váhy pre rôzne typy tagov
    const weights = {
      birth_date: 2.0,
      death_date: 2.0,
      maiden_surname: 1.5,
      spouse_given: 1.5,
      spouse_surname: 1.5,
      given: 1.0,
      surname: 1.0,
      status_minor: 1.0,
      status_widow: 1.0,
      origin_place: 1.0,
      residence: 1.0
    };
    
    let totalWeight = 0;
    let weightedSum = 0;
    
    for (const tag of ctx.tags) {
      const weight = weights[tag.type as keyof typeof weights] || 0.5;
      totalWeight += weight;
      weightedSum += tag.confidence * weight;
    }
    
    const baseScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    
    // Penalizácia za chyby
    const errorPenalty = ctx.errors.length * 0.1;
    
    return Math.max(0, Math.min(1, baseScore - errorPenalty));
  }

  /**
   * Naplnenie výsledku z tagov
   */
  private fillResultFromTags(result: ParsedRecord, ctx: ParsingContext) {
    // Helper funkcia pre výber najlepšieho tagu
    const getBestTag = (type: string) => {
      const tags = ctx.tags.filter(t => t.type === type);
      if (tags.length === 0) return undefined;
      return tags.reduce((best, current) => 
        current.confidence > best.confidence ? current : best
      );
    };

    // Naplnenie polí
    const givenTag = getBestTag('given');
    if (givenTag) {
      result.given = {
        value: givenTag.value,
        confidence: givenTag.confidence,
        source_rule: givenTag.source_rule,
        span: givenTag.span,
        uncertain: givenTag.uncertain
      };
    }

    const surnameTag = getBestTag('surname');
    if (surnameTag) {
      result.surname = {
        value: surnameTag.value,
        confidence: surnameTag.confidence,
        source_rule: surnameTag.source_rule,
        span: surnameTag.span,
        uncertain: surnameTag.uncertain
      };
    }

    const maidenTag = getBestTag('maiden_surname');
    if (maidenTag) {
      result.maiden_surname = {
        value: maidenTag.value,
        confidence: maidenTag.confidence,
        source_rule: maidenTag.source_rule,
        span: maidenTag.span,
        uncertain: maidenTag.uncertain
      };
    }

    const spouseGivenTag = getBestTag('spouse_given');
    if (spouseGivenTag) {
      result.spouse_given = {
        value: spouseGivenTag.value,
        confidence: spouseGivenTag.confidence,
        source_rule: spouseGivenTag.source_rule,
        span: spouseGivenTag.span,
        uncertain: spouseGivenTag.uncertain
      };
    }

    const spouseSurnameTag = getBestTag('spouse_surname');
    if (spouseSurnameTag) {
      result.spouse_surname = {
        value: spouseSurnameTag.value,
        confidence: spouseSurnameTag.confidence,
        source_rule: spouseSurnameTag.source_rule,
        span: spouseSurnameTag.span,
        uncertain: spouseSurnameTag.uncertain
      };
    }

    // Statusy
    const statusTags = ctx.tags.filter(t => t.type.startsWith('status_'));
    if (statusTags.length > 0) {
      const bestStatus = statusTags.reduce((best, current) =>
        current.confidence > best.confidence ? current : best
      );
      
      const statusMap = {
        'status_minor': bestStatus.value === 'maloletý' ? 'maloletý' as const : 'maloletá' as const,
        'status_widow': 'vdova' as const, // simplifikácia
        'status_divorced': 'rozvedený' as const,
        'status_single': 'slobodný' as const
      };
      
      const statusValue = statusMap[bestStatus.type as keyof typeof statusMap];
      if (statusValue) {
        result.status = {
          value: statusValue,
          confidence: bestStatus.confidence,
          source_rule: bestStatus.source_rule,
          span: bestStatus.span,
          uncertain: bestStatus.uncertain
        };
      }
    }

    // Miesta
    const originTag = getBestTag('origin_place');
    if (originTag) {
      result.origin_place = {
        value: originTag.value,
        confidence: originTag.confidence,
        source_rule: originTag.source_rule,
        span: originTag.span,
        uncertain: originTag.uncertain
      };
    }

    const residenceTag = getBestTag('residence');
    if (residenceTag) {
      result.residence = {
        value: residenceTag.value,
        confidence: residenceTag.confidence,
        source_rule: residenceTag.source_rule,
        span: residenceTag.span,
        uncertain: residenceTag.uncertain
      };
    }

    const birthPlaceTag = getBestTag('birth_place');
    if (birthPlaceTag) {
      result.birth_place = {
        value: birthPlaceTag.value,
        confidence: birthPlaceTag.confidence,
        source_rule: birthPlaceTag.source_rule,
        span: birthPlaceTag.span,
        uncertain: birthPlaceTag.uncertain
      };
    }

    // Dátumy
    const birthDateTag = getBestTag('birth_date');
    if (birthDateTag) {
      result.birth_date = {
        value: birthDateTag.value,
        confidence: birthDateTag.confidence,
        source_rule: birthDateTag.source_rule,
        span: birthDateTag.span,
        uncertain: birthDateTag.uncertain
      };
    }

    const deathDateTag = getBestTag('death_date');
    if (deathDateTag) {
      result.death_date = {
        value: deathDateTag.value,
        confidence: deathDateTag.confidence,
        source_rule: deathDateTag.source_rule,
        span: deathDateTag.span,
        uncertain: deathDateTag.uncertain
      };
    }

    // Suffixy
    const suffixTag = getBestTag('name_suffix');
    if (suffixTag) {
      result.name_suffix = {
        value: suffixTag.value,
        confidence: suffixTag.confidence,
        source_rule: suffixTag.source_rule,
        span: suffixTag.span,
        uncertain: suffixTag.uncertain
      };
    }

    const romanTag = getBestTag('name_suffix_roman');
    if (romanTag) {
      result.name_suffix_roman = {
        value: romanTag.value,
        confidence: romanTag.confidence,
        source_rule: romanTag.source_rule,
        span: romanTag.span,
        uncertain: romanTag.uncertain
      };
    }

    // Gender
    const genderTag = getBestTag('gender');
    if (genderTag) {
      result.gender = genderTag.value as 'muž' | 'žena' | 'neisté';
    }

    // SPF
    const spfTag = getBestTag('is_spf');
    if (spfTag) {
      result.is_spf = spfTag.value === 'true';
      result.spf_conf = spfTag.confidence;
    }

    const spfReasonTag = getBestTag('spf_reason');
    if (spfReasonTag) {
      result.spf_reason = spfReasonTag.value as 'TEXT_MATCH' | 'FIELD_MATCH';
    }

    // Evidence spans
    result.evidence_spans = ctx.tags.map(tag => ({
      type: tag.type,
      span: tag.span,
      text: ctx.originalText.substring(tag.span[0], tag.span[1])
    }));
  }

  /**
   * Konverzia čísla
   */
  private parseNumber(value: any): number | null {
    if (value === null || value === undefined || value === '') return null;
    const num = parseInt(value.toString());
    return isNaN(num) ? null : num;
  }

  /**
   * Vytvorenie čistého mena pre vyhľadávanie
   */
  private createCleanName(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // odstránenie diakritiky
      .replace(/\([^)]*\)/g, '') // odstránenie zátvoriek
      .replace(/\b(r\.|ž\.|m\.)\b/gi, '') // odstránenie izolovaných markerov
      .replace(/[^\w\s]/g, ' ') // len písmená, čísla, medzery
      .replace(/\s+/g, ' ')
      .trim();
  }
}
