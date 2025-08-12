import { OwnerTag } from './db';
import { isGivenName } from './given-names';

// Mapping pre odstránenie diakritiky
const diacriticsMap: Record<string, string> = {
  'á': 'a', 'ä': 'a', 'à': 'a', 'ā': 'a', 'ă': 'a', 'ą': 'a',
  'é': 'e', 'ě': 'e', 'è': 'e', 'ē': 'e', 'ė': 'e', 'ę': 'e',
  'í': 'i', 'ì': 'i', 'ī': 'i', 'į': 'i', 'î': 'i', 'ï': 'i',
  'ó': 'o', 'ö': 'o', 'ò': 'o', 'ō': 'o', 'ő': 'o', 'õ': 'o',
  'ú': 'u', 'ü': 'u', 'ù': 'u', 'ū': 'u', 'ů': 'u', 'ű': 'u',
  'ý': 'y', 'ÿ': 'y', 'ỳ': 'y', 'ȳ': 'y',
  'č': 'c', 'ç': 'c', 'ć': 'c', 'ċ': 'c',
  'ď': 'd', 'đ': 'd',
  'ň': 'n', 'ń': 'n', 'ņ': 'n', 'ñ': 'n',
  'ř': 'r', 'ŕ': 'r',
  'š': 's', 'ś': 's', 'ş': 's', 'ș': 's',
  'ť': 't', 'ţ': 't', 'ț': 't',
  'ž': 'z', 'ź': 'z', 'ż': 'z',
  'ľ': 'l', 'ĺ': 'l', 'ļ': 'l', 'ł': 'l',
  'ô': 'o', 'ŕ': 'r', 'ĺ': 'l'
};

export function removeDiacritics(text: string): string {
  return text
    .toLowerCase()
    .split('')
    .map(char => diacriticsMap[char] || char)
    .join('');
}

// Formátovanie mien - prvé písmeno veľké, zvyšok malé
export function formatName(name: string): string {
  if (!name) return name;
  
  return name.trim()
    .split(/\s+/)
    .map(word => {
      if (word.length === 0) return word;
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');
}

export function normalizeText(text: string): string {
  // Odstránenie diakritiky a lowercase
  let normalized = removeDiacritics(text);
  
  // Odstránenie zátvoriek a ich obsahu
  normalized = normalized.replace(/\([^)]*\)/g, '');
  
  // Odstránenie markerov r., ž., m.
  normalized = normalized.replace(/\b[rm]\.|\bž\./g, '');
  
  // Odstránenie slov "maloletý/á"
  normalized = normalized.replace(/\bmalolet[yá]\b/g, '');
  
  // Normalizácia medzier
  normalized = normalized.replace(/\s+/g, ' ').trim();
  
  return normalized;
}

// Typy pre systémový parser
interface ParsedTag {
  key: string;
  value: string;
  confidence: number;
  uncertain: boolean;
  rule: string;
}

interface ParsedPerson {
  given?: string;
  surname?: string;
  maiden_surname?: string;
  spouse_given?: string;
  spouse_surname?: string;
  status?: string;
  origin_place?: string;
  death_date?: string;
  birth_date?: string;
  notes: string[];
  tags: ParsedTag[];
}

// Slovník markerov
const MARKERS = {
  // Rodné priezvisko
  maiden: ['r.', 'rod.', 'rodné', 'za slobodna'],
  
  // Manžel/manželka  
  spouse_female: ['ž.', 'žena', 'manželka', 'manž.'],
  spouse_male: ['m.', 'muž', 'manžel', 'manž.'],
  
  // Rodinné vzťahy
  son: ['syn', 's.', 'synáčik', 'synacik', 'chlapec'],
  daughter: ['dcéra', 'dcera', 'd.', 'dcérka', 'dcerka', 'dievča', 'dievca'],
  father: ['otec', 'tatko', 'tat.', 'tato', 'papa', 'o.'],
  mother: ['matka', 'mama', 'mat.', 'mam.', 'ma'],
  brother: ['brat', 'br.', 'braček', 'bracek'],
  sister: ['sestra', 'ses.', 'sestička', 'sesticka'],
  grandfather: ['dedko', 'ded.', 'starý otec', 'stary otec'],
  grandmother: ['babka', 'bab.', 'stará matka', 'stara matka'],
  grandson: ['vnuk', 'vn.', 'vnúčik', 'vnucik'],
  granddaughter: ['vnučka', 'vnucka', 'vn.', 'vnúčka', 'vnucka'],
  
  // Stav
  widow: ['vd.', 'vdova'],
  widower: ['vdovec'],
  minor: ['maloletý', 'maloletá', 'mal.'],
  divorced: ['rozvedený', 'rozvedená', 'rozv.'],
  
  // Pôvod
  origin: ['z', 'zo', 'od', 'rodák z', 'rodáčka z', 'ex', 'de'],
  
  // Úmrtie
  death: ['zomrel', 'zomrela', 'umrel', 'umrela', '†', '✝', '✞'],
  
  // Narodenie
  birth: ['nar.', 'narodený', 'narodená', 'nár.']
};

// Mapovanie markerov na typ tagu s prefixom
const MARKER_TO_TAG_TYPE = {
  spouse_female: 'manželka',
  spouse_male: 'manžel',
  son: 'syn',
  daughter: 'dcéra', 
  father: 'otec',
  mother: 'matka',
  brother: 'brat',
  sister: 'sestra',
  grandfather: 'dedko',
  grandmother: 'babka',
  grandson: 'vnuk',
  granddaughter: 'vnučka'
};

export function parsePersonRecord(text: string): ParsedPerson {
  const result: ParsedPerson = {
    notes: [],
    tags: []
  };

  // 1. Rozdeliť na hlavnú časť a zátvorky
  const parts = splitIntoMainAndParentheses(text);
  
  // 2. Spracovať hlavnú časť
  parseMainPart(parts.main, result);
  
  // 3. Spracovať zátvorky
  parts.parentheses.forEach(content => {
    parseParenthesesContent(content, result);
  });
  
  // 4. Konvertovať parsed údaje na tagy
  convertToTags(result);
  
  return result;
}

function splitIntoMainAndParentheses(text: string): {
  main: string;
  parentheses: string[];
} {
  const parentheses: string[] = [];
  let main = text;
  
  // Extrahovať obsah zátvoriek
  const parenthesesRegex = /\(([^)]*)\)/g;
  let match;
  
  while ((match = parenthesesRegex.exec(text)) !== null) {
    parentheses.push(match[1].trim());
  }
  
  // Odstrániť zátvorky z hlavnej časti
  main = text.replace(/\([^)]*\)/g, '').trim();
  
  return { main, parentheses };
}

function parseMainPart(mainText: string, result: ParsedPerson): void {
  let workingText = mainText;
  
  // NOVÉ: Oddeliť adresu od mena (text za čiarkou ktorý obsahuje čísla, mestá, krajiny)
  const addressMatch = workingText.match(/^([^,]+),\s*(.+)$/);
  if (addressMatch) {
    const namePartCandidate = addressMatch[1].trim();
    const addressCandidate = addressMatch[2].trim();
    
    // Detekcia adresy: obsahuje čísla alebo známe mestá/krajiny
    const addressPatterns = [
      /\d+/, // obsahuje čísla
      /\b(Bratislava|Košice|Prešov|Žilina|Banská Bystrica|Nitra|Trnava|Trenčín|Martin|Poprad|Prievidza|Zvolen|Považská Bystrica|Nové Zámky|Michalovce|Komárno|Levice|Humenné|Bardejov|Liptovský Mikuláš|Ružomberok|Dolný Kubín|Rimavská Sobota|Rožňava|Lučenec|Senica|Dunajská Streda|Topoľčany|Malacky|Skalica|Snina|Medzilaborce|Stará Ľubovňa|Kežmarok|Sabinov|Vranov nad Topľou|Trebišov|Spišská Nová Ves|Gelnica|Stropkov|Svidník|Hanušovce nad Topľou)\b/i, // slovenské mestá
      /\b(SK|Slovakia|Slovensko|CZ|Czech|Česko)\b/i, // krajiny
      /\b\d+\b.*\b(ulica|cesta|námestie|nám\.|ul\.|č\.)\b/i // ulica s číslom
    ];
    
    const isAddress = addressPatterns.some(pattern => pattern.test(addressCandidate));
    
    if (isAddress) {
      workingText = namePartCandidate; // použiť len časť pred čiarkou pre parsing mena
      
      // Pridaj adresu ako tag
      result.tags.push({
        key: 'adresa',
        value: addressCandidate,
        confidence: 0.9,
        uncertain: false,
        rule: 'RULE_ADDRESS_DETECTION'
      });
    }
  }
  
  // Najprv hľadaj rodné priezvisko v hlavnej časti
  for (const marker of MARKERS.maiden) {
    const regex = new RegExp(`\\b${escapeRegex(marker)}\\s+([^,]+)`, 'i');
    const match = workingText.match(regex);
    
    if (match) {
      result.maiden_surname = formatName(match[1].trim());
      result.tags.push({
        key: 'rodné_priezvisko',
        value: formatName(match[1].trim()),
        confidence: 1.0,
        uncertain: false,
        rule: 'RULE_MAIDEN_MAIN'
      });
      
      // Odstrániť z hlavného textu
      workingText = workingText.replace(match[0], '').trim();
      break;
    }
  }
  
  // Inteligentné rozlíšenie mena a priezviska pomocou slovníka
  const nameParts = workingText.split(/\s+/).filter(part => {
    // Odstrániť čiarky z mien
    const cleanPart = part.replace(/[,]/g, '').trim();
    return cleanPart.length > 0;
  }).map(part => part.replace(/[,]/g, '').trim());
  
  if (nameParts.length >= 1) {
    const givenNames: string[] = [];
    const surnames: string[] = [];
    
    // Identifikuj krstné mená a priezviská pomocou slovníka
    for (let i = 0; i < nameParts.length; i++) {
      const part = nameParts[i];
      
      if (isGivenName(part)) {
        givenNames.push(part);
      } else {
        // Ak nie je krstné meno, je to pravdepodobne priezvisko
        surnames.push(part);
      }
    }
    
    // Ak máme identifikované krstné mená, použij prvé ako primárne
    if (givenNames.length > 0) {
      result.given = formatName(givenNames[0]); // Iba prvé krstné meno
      result.tags.push({
        key: 'krstné_meno',
        value: formatName(givenNames[0]),
        confidence: 1.0,
        uncertain: false,
        rule: 'RULE_GIVEN_DICTIONARY'
      });
      
      // Ak máme viac krstných mien, pridaj ich ako priezviská
      if (givenNames.length > 1) {
        for (let i = 1; i < givenNames.length; i++) {
          surnames.push(givenNames[i]);
        }
      }
    }
    
    // Spracuj priezviská
    if (surnames.length > 0) {
      result.surname = formatName(surnames.join(' '));
      result.tags.push({
        key: 'priezvisko',
        value: formatName(result.surname),
        confidence: 0.9,
        uncertain: false,
        rule: 'RULE_SURNAME_INTELLIGENT'
      });
    }
    
    // Ak sme nenašli žiadne krstné meno, použij heuristiku
    if (givenNames.length === 0 && nameParts.length >= 2) {
      const firstToken = nameParts[0];
      const lastToken = nameParts[nameParts.length - 1];
      
      if (firstToken === firstToken.toUpperCase() || lastToken.endsWith('ová')) {
        // Prvý je priezvisko, ostatné sú mená
        result.surname = firstToken;
        result.given = nameParts.slice(1).join(' ');
        
        result.tags.push({
          key: 'priezvisko',
          value: firstToken,
          confidence: firstToken === firstToken.toUpperCase() ? 0.9 : 0.8,
          uncertain: true,
          rule: 'RULE_SURNAME_CAPS_FALLBACK'
        });
        
        result.tags.push({
          key: 'krstné_meno',
          value: result.given,
          confidence: 0.6,
          uncertain: true,
          rule: 'RULE_GIVEN_HEURISTIC_FALLBACK'
        });
      } else {
        // Posledný je priezvisko, ostatné sú mená
        result.surname = lastToken;
        result.given = nameParts.slice(0, -1).join(' ');
        
        result.tags.push({
          key: 'priezvisko',
          value: lastToken,
          confidence: 0.7,
          uncertain: true,
          rule: 'RULE_SURNAME_LAST_FALLBACK'
        });
        
        result.tags.push({
          key: 'krstné_meno',
          value: result.given,
          confidence: 0.6,
          uncertain: true,
          rule: 'RULE_GIVEN_HEURISTIC_FALLBACK'
        });
      }
    }
    
    // Ak máme iba jedno slovo a nie je to krstné meno
    if (nameParts.length === 1 && givenNames.length === 0) {
      result.surname = nameParts[0];
      result.tags.push({
        key: 'priezvisko',
        value: nameParts[0],
        confidence: 0.8,
        uncertain: true,
        rule: 'RULE_SURNAME_SINGLE'
      });
    }
    
    // Ak máme iba jedno slovo a je to krstné meno
    if (nameParts.length === 1 && givenNames.length === 1) {
      result.given = nameParts[0];
      result.tags.push({
        key: 'krstné_meno',
        value: nameParts[0],
        confidence: 1.0,
        uncertain: false,
        rule: 'RULE_GIVEN_SINGLE'
      });
    }
  }
}

function parseParenthesesContent(content: string, result: ParsedPerson): void {
  // Rozdeliť obsah zátvoriek na časti oddelené čiarkami
  const clauses = content.split(',').map(c => c.trim());
  
  for (const clause of clauses) {
    if (!clause) continue;
    
    // Skúsiť parsovať rôzne typy údajov v tomto poradí:
    
    // 1. Úmrtie
    if (parseDeathInfo(clause, result)) continue;
    
    // 2. Stav (vdova, vdovec, maloletý)
    if (parseStatus(clause, result)) continue;
    
    // 3. Manžel/manželka
    if (parseSpouse(clause, result)) continue;
    
    // 4. Rodinné vzťahy
    if (parseFamilyRelation(clause, result)) continue;
    
    // 5. Pôvod (miesto)
    if (parseOrigin(clause, result)) continue;
    
    // 6. Rodné priezvisko (ak ešte nie je)
    if (parseMaidenSurname(clause, result)) continue;
    
    // 7. Ostatné do poznámok
    result.notes.push(clause);
    result.tags.push({
      key: 'poznámka',
      value: clause,
      confidence: 0.5,
      uncertain: true,
      rule: 'RULE_NOTE'
    });
  }
}

function parseDeathInfo(clause: string, result: ParsedPerson): boolean {
  // Hľadaj dátum úmrtia
  const deathMarkers = MARKERS.death;
  
  for (const marker of deathMarkers) {
    if (clause.toLowerCase().includes(marker.toLowerCase()) || clause.includes(marker)) {
      // Hľadaj dátum
      const dateRegex = /(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})/;
      const dateMatch = clause.match(dateRegex);
      
      if (dateMatch) {
        const [, day, month, year] = dateMatch;
        result.death_date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
        
        result.tags.push({
          key: '✝️',
          value: `${day}.${month}.${year}`,
          confidence: 1.0,
          uncertain: false,
          rule: 'RULE_DEATH_DATE'
        });
      } else {
        // Len marker bez dátumu
        result.tags.push({
          key: '✝️',
          value: 'neznámy',
          confidence: 0.8,
          uncertain: true,
          rule: 'RULE_DEATH_MARKER'
        });
      }
      return true;
    }
  }
  
  return false;
}

function parseStatus(clause: string, result: ParsedPerson): boolean {
  const statusMarkers = [...MARKERS.widow, ...MARKERS.widower, ...MARKERS.minor, ...MARKERS.divorced];
  
  for (const marker of statusMarkers) {
    if (clause.toLowerCase().includes(marker.toLowerCase())) {
      let statusValue = marker;
      if (MARKERS.widow.includes(marker)) statusValue = 'vdova';
      else if (MARKERS.widower.includes(marker)) statusValue = 'vdovec';
      else if (MARKERS.minor.includes(marker)) statusValue = 'maloletý/á';
      else if (MARKERS.divorced.includes(marker)) statusValue = 'rozvedený/á';
      
      result.status = statusValue;
      result.tags.push({
        key: 'stav',
        value: statusValue,
        confidence: 1.0,
        uncertain: false,
        rule: 'RULE_STATUS'
      });
      return true;
    }
  }
  
  return false;
}

// Funkcia na určenie pohlavia na základe mena a priezviska
function inferGenderFromName(givenName?: string, surname?: string): 'muž' | 'žena' | 'neznáme' {
  // Ak máme priezvisko, použiť ho pre určenie pohlavia
  if (surname) {
    // Ženské koncovky priezvisk
    if (surname.endsWith('ová') || surname.endsWith('á') || surname.endsWith('ná')) {
      return 'žena';
    }
    // Mužské koncovky (väčšina ostatných)
    if (surname.match(/[^aáeéiíoóuúyý]$/)) {
      return 'muž';
    }
  }
  
  // Ak máme krstné meno, skúsiť ho
  if (givenName) {
    const femaleNames = ['Anna', 'Mária', 'Zuzana', 'Elena', 'Jana', 'Katarína', 'Eva', 'Alžbeta', 'Magdaléna', 'Viera', 'Ľudmila', 'Božena', 'Emília', 'Terézia', 'Margita', 'Jolana', 'Darina', 'Milada', 'Oľga', 'Veronika'];
    const maleNames = ['Ján', 'Peter', 'Pavol', 'Michal', 'Tomáš', 'Martin', 'Jozef', 'Milan', 'František', 'Vladimír', 'Štefan', 'Ladislav', 'Rudolf', 'Anton', 'Marián', 'Ondrej', 'Stanislav', 'Jaroslav', 'Dušan', 'Roman'];
    
    const normalizedGiven = givenName.charAt(0).toUpperCase() + givenName.slice(1).toLowerCase();
    
    if (femaleNames.includes(normalizedGiven)) {
      return 'žena';
    }
    if (maleNames.includes(normalizedGiven)) {
      return 'muž';
    }
  }
  
  return 'neznáme';
}

function parseSpouse(clause: string, result: ParsedPerson): boolean {
  // Najprv určiť pohlavie vlastníka na základe priezviska
  const ownerGender = result.gender || inferGenderFromName(result.given, result.surname);
  
  // Skúsiť ženský vzor
  for (const marker of MARKERS.spouse_female) {
    // Najprv skús pattern s rodným priezviskom: "manž. Zuzana r. Kúkeľová"
    const regexWithMaiden = new RegExp(`\\b${escapeRegex(marker)}\\s*([A-ZÁČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záčďéíĺľňóôŕšťúýž]+)(?:\\s+r\\.\\s*([A-ZÁČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záčďéíĺľňóôŕšťúýž]+(?:ová|ná|á)?))`, 'i');
    const matchWithMaiden = clause.match(regexWithMaiden);
    
    // Ak nie, skús pattern bez rodného priezviska: "manž. Zuzana"
    const regexSimple = new RegExp(`\\b${escapeRegex(marker)}\\s*([A-ZÁČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záčďéíĺľňóôŕšťúýž]+(?:\\s+[A-ZÁČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záčďéíĺľňóôŕšťúýž]+)?)`, 'i');
    const matchSimple = clause.match(regexSimple);
    
    const match = matchWithMaiden || matchSimple;
    
    if (match) {
      const spouseGivenName = match[1].trim();
      const maidenSurname = matchWithMaiden ? match[2]?.trim() : undefined; // rodné priezvisko len ak bol match s "r."
      
      // Získaj priezvisko vlastníka (ak existuje)
      const ownerSurname = result.surname || result.tags.find(t => t.key === 'priezvisko')?.value;
      
      // Vytvor kompletné meno partnera na základe pohlavia vlastníka
      let fullSpouseName = spouseGivenName;
      if (ownerSurname) {
        let spouseSurname = ownerSurname;
        
        if (ownerGender === 'žena') {
          // Vlastník je žena, partner je muž - použiť základnú (mužskú) formu priezviska
          if (ownerSurname.endsWith('ová')) {
            spouseSurname = ownerSurname.replace('ová', '');
          } else if (ownerSurname.endsWith('ská')) {
            spouseSurname = ownerSurname.replace('ská', 'ský');
          } else if (ownerSurname.endsWith('cká')) {
            spouseSurname = ownerSurname.replace('cká', 'cký');
          }
          // Inak ponechať pôvodné priezvisko
        } else {
          // Vlastník je muž, partner je žena - použiť ženskú formu priezviska
          if (spouseSurname.endsWith('ský')) {
            spouseSurname = spouseSurname.replace('ský', 'ská');
          } else if (spouseSurname.endsWith('cký')) {
            spouseSurname = spouseSurname.replace('cký', 'cká');
          } else if (!spouseSurname.endsWith('ová') && !spouseSurname.endsWith('á')) {
            // Pridaj -ová pre ostatné priezviská
            spouseSurname = spouseSurname + 'ová';
          }
        }
        
        fullSpouseName = `${spouseGivenName} ${spouseSurname}`;
      }
      
      result.spouse_given = spouseGivenName;
      if (ownerSurname) {
        result.spouse_surname = ownerSurname; // priezvisko po vydaji
      }
      
      // Rozhodnúť či je to manžel alebo manželka na základe pohlavia vlastníka
      const spouseKey = ownerGender === 'žena' ? 'manžel' : 'manželka';
      
      result.tags.push({
        key: spouseKey,
        value: formatName(fullSpouseName),
        confidence: 1.0,
        uncertain: false,
        rule: 'RULE_SPOUSE_FEMALE'
      });
      
      // Pridaj rodné priezvisko manželky ak existuje
      if (maidenSurname) {
        result.tags.push({
          key: 'manželka_rodné',
          value: formatName(maidenSurname),
          confidence: 1.0,
          uncertain: false,
          rule: 'RULE_SPOUSE_MAIDEN'
        });
      }
      
      return true;
    }
  }
  
  // Skúsiť mužský vzor
  for (const marker of MARKERS.spouse_male) {
    const regex = new RegExp(`\\b${escapeRegex(marker)}\\s*([A-ZÁČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záčďéíĺľňóôŕšťúýž]*(?:\\s+[A-ZÁČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][a-záčďéíĺľňóôŕšťúýž]*)?)(?:\\s+r\\.|$)`, 'i');
    const match = clause.match(regex);
    
    if (match) {
      let spouseName = match[1].trim();
      
      // Odstrániť "r." a všetko za ním
      spouseName = spouseName.replace(/\s+r\..*$/, '');
      
      const nameParts = spouseName.split(/\s+/);
      
      result.spouse_given = nameParts[0];
      if (nameParts.length > 1) {
        result.spouse_surname = nameParts.slice(1).join(' ');
      }
      
      // Rozhodnúť či je to manžel alebo manželka na základe pohlavia vlastníka
      const spouseKey = ownerGender === 'žena' ? 'manžel' : 'manželka';
      
      result.tags.push({
        key: spouseKey,
        value: formatName(spouseName),
        confidence: 1.0,
        uncertain: false,
        rule: 'RULE_SPOUSE_MALE'
      });
      return true;
    }
  }
  
  return false;
}

function parseFamilyRelation(clause: string, result: ParsedPerson): boolean {
  // Skúsiť všetky typy rodinných vzťahov
  for (const [markerType, markers] of Object.entries(MARKERS)) {
    if (!MARKER_TO_TAG_TYPE[markerType as keyof typeof MARKER_TO_TAG_TYPE]) continue;
    
    for (const marker of markers) {
      const regex = new RegExp(`\\b${escapeRegex(marker)}\\s+([A-ZÁČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][^,]*?)(?:\\s+r\\.|$)`, 'i');
      const match = clause.match(regex);
      
      if (match) {
        const relationName = match[1].trim();
        const tagType = MARKER_TO_TAG_TYPE[markerType as keyof typeof MARKER_TO_TAG_TYPE];
        
        result.tags.push({
          key: tagType,
          value: relationName,
          confidence: 1.0,
          uncertain: false,
          rule: `RULE_FAMILY_${markerType.toUpperCase()}`
        });
        return true;
      }
    }
  }
  
  return false;
}

function parseOrigin(clause: string, result: ParsedPerson): boolean {
  for (const marker of MARKERS.origin) {
    const regex = new RegExp(`\\b${escapeRegex(marker)}\\s+([^,]+)`, 'i');
    const match = clause.match(regex);
    
    if (match) {
      result.origin_place = match[1].trim();
      result.tags.push({
        key: 'pôvod',
        value: match[1].trim(),
        confidence: 0.9,
        uncertain: false,
        rule: 'RULE_ORIGIN'
      });
      return true;
    }
  }
  
  return false;
}

function parseMaidenSurname(clause: string, result: ParsedPerson): boolean {
  if (result.maiden_surname) return false; // Už máme
  
  for (const marker of MARKERS.maiden) {
    // Regex pre zachytenie rodného priezviska až po čiarku, zátvorku alebo koniec
    const regex = new RegExp(`\\b${escapeRegex(marker)}\\s+([A-ZÁČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ][^,)]*?)(?:[,)]|$)`, 'i');
    const match = clause.match(regex);
    
    if (match) {
      const maidenName = match[1].trim();
      result.maiden_surname = maidenName;
      result.tags.push({
        key: 'rodné_priezvisko',
        value: maidenName,
        confidence: 1.0,
        uncertain: false,
        rule: 'RULE_MAIDEN_PARENTHESES'
      });
      return true;
    }
  }
  
  return false;
}

function convertToTags(result: ParsedPerson): void {
  // Mená a priezviská už sú v result.tags
  // Pridáme len základné meno tagy pre kompatibilitu
  if (result.given) {
    result.tags.push({
      key: 'meno',
      value: result.given,
      confidence: 0.7,
      uncertain: true,
      rule: 'RULE_COMPAT_GIVEN'
    });
  }
  
  if (result.surname) {
    result.tags.push({
      key: 'meno',
      value: result.surname,
      confidence: 0.8,
      uncertain: false,
      rule: 'RULE_COMPAT_SURNAME'
    });
  }
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Hlavná funkcia pre kompatibilitu
export function generateTags(menoRaw: string): OwnerTag[] {
  const parsed = parsePersonRecord(menoRaw);
  
  return parsed.tags.map(tag => ({
    key: tag.key,
    value: tag.value,
    uncertain: tag.uncertain,
    id: 0, // Bude nastavené v databáze
    owner_id: 0 // Bude nastavené v databáze
  })) as OwnerTag[];
}

// Export pre použitie v iných súboroch
export function extractTokens(text: string): string[] {
  if (!text) return [];
  
  // Odstránenie zátvoriek a ich obsahu pre základné tokeny
  const baseText = text.replace(/\([^)]*\)/g, '').trim();
  
  return baseText
    .split(/\s+/)
    .map(token => token.replace(/[,.;]/g, ''))
    .filter(token => token.length > 0 && !['a', 'i', 'the', 'in', 'on', 'at', 'by', 'for', 'with', 'to'].includes(token.toLowerCase()));
}

// Pomocné funkcie pre spätnú kompatibilitu
export function extractDeathInfo(text: string): {
  isDead: boolean;
  deathDate?: string;
  uncertain: boolean;
} {
  const parsed = parsePersonRecord(text);
  const deathTag = parsed.tags.find(tag => tag.key === '✝️');
  
  if (deathTag) {
    return {
      isDead: true,
      deathDate: deathTag.value === 'neznámy' ? undefined : deathTag.value,
      uncertain: deathTag.uncertain
    };
  }
  
  return { isDead: false, uncertain: false };
}

export function extractFamilyRelations(text: string): Array<{
  key: string;
  value: string;
  uncertain: boolean;
}> {
  const parsed = parsePersonRecord(text);
  return parsed.tags
    .filter(tag => ['manžel', 'manželka', 'syn', 'dcéra', 'otec', 'matka', 'brat', 'sestra'].includes(tag.key))
    .map(tag => ({
      key: tag.key,
      value: tag.value,
      uncertain: tag.uncertain
    }));
}

// Funkcia pre detekciu pohlavia
export function detectGender(text: string): { gender: string } {
  if (!text) return { gender: 'neisté' };
  
  const lowerText = text.toLowerCase();
  
  // Hľadaj ženske koncovky
  if (lowerText.includes('ová') || lowerText.includes('ná') || lowerText.includes('ka') || 
      lowerText.includes('žena') || lowerText.includes('ž.') || lowerText.includes('manželka')) {
    return { gender: 'žena' };
  }
  
  // Hľadaj mužské indikátory
  if (lowerText.includes('muž') || lowerText.includes('m.') || lowerText.includes('manžel')) {
    return { gender: 'muž' };
  }
  
  return { gender: 'neisté' };
}

// Funkcia pre detekciu maloletosti
export function hasMinorFlag(text: string): boolean {
  if (!text) return false;
  
  const lowerText = text.toLowerCase();
  return lowerText.includes('maloletý') || lowerText.includes('maloletá') || 
         lowerText.includes('mal.') || lowerText.includes('minor');
}
