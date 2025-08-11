/**
 * Utility funkcie pre Google vyhľadávanie - čistenie mena a tvorba dotazu
 */

/**
 * Vyčistí meno podľa špecifikácie pre Google vyhľadávanie
 * @param menoRaw - pôvodný reťazec mena z databázy
 * @returns vyčistené meno alebo prázdny reťazec ak nie je validné
 */
export function cleanNameForSearch(menoRaw: string): string {
  if (!menoRaw || typeof menoRaw !== 'string') {
    return '';
  }

  let cleaned = menoRaw;

  // 1. Odstrániť celý obsah v zátvorkách (...)
  cleaned = cleaned.replace(/\([^)]*\)/g, '');

  // 2. Odstrániť samostatné markery r. / ž. / m. (ak ostali mimo zátvoriek)
  cleaned = cleaned.replace(/\b[ržm]\.\s*/g, '');

  // 3. Znormalizovať medzery (viacnásobné → jedna), orezať okraje
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // 4. Kontrola či obsahuje aspoň jeden neprázdny token
  if (!cleaned || cleaned.length === 0) {
    return '';
  }

  // Kontrola či ostalo len "maloletý/á" alebo podobné generické výrazy
  const genericTerms = ['maloletý', 'maloletá', 'nezletilý', 'nezletilá', 'neznámy', 'neznáma'];
  const lowerCleaned = cleaned.toLowerCase();
  if (genericTerms.some(term => lowerCleaned === term || lowerCleaned === term + '/á' || lowerCleaned === term + '/ý')) {
    return '';
  }

  return cleaned;
}

/**
 * Vytvorí Google search URL pre meno a lokalitu
 * @param menoRaw - pôvodný reťazec mena z databázy
 * @param lokalita - katastrálne územie
 * @returns Google search URL alebo null ak meno nie je validné
 */
export function createGoogleSearchUrl(menoRaw: string, lokalita: string): string | null {
  const cleanedName = cleanNameForSearch(menoRaw);
  
  if (!cleanedName) {
    return null;
  }

  // Zabaliť meno do úvodzoviek a pridať lokalitu
  const query = `"${cleanedName}" ${lokalita}`;
  
  // Percent-enkódovanie dotazu
  const encodedQuery = encodeURIComponent(query);
  
  // Vytvorenie finálnej URL
  return `https://www.google.com/search?q=${encodedQuery}&hl=sk`;
}

/**
 * Vytvorí popis pre Google search tlačidlo (pre title a aria-label)
 * @param menoRaw - pôvodný reťazec mena z databázy
 * @param lokalita - katastrálne územie
 * @returns popis pre accessibility
 */
export function createGoogleSearchDescription(menoRaw: string, lokalita: string): string {
  const cleanedName = cleanNameForSearch(menoRaw);
  
  if (!cleanedName) {
    return 'Google vyhľadávanie nie je k dispozícii';
  }

  return `Hľadať na Google: "${cleanedName}" ${lokalita}`;
}

/**
 * Skontroluje či je Google search dostupný pre daný záznam
 * @param menoRaw - pôvodný reťazec mena z databázy
 * @returns true ak je search dostupný
 */
export function isGoogleSearchAvailable(menoRaw: string): boolean {
  return cleanNameForSearch(menoRaw) !== '';
}
