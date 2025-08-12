/**
 * Tag Merger - Inteligentné zlúčenie tagov z AdvancedParser a SystemTags
 */

export interface TagWithSource {
  key: string;
  value: string;
  confidence: number;
  source: 'advanced' | 'system';
  uncertain?: boolean;
  rule?: string;
}

export interface MergedTag {
  key: string;
  value: string;
  confidence: number;
  source: 'advanced' | 'system' | 'merged';
  alternatives?: TagWithSource[];
  conflict?: boolean;
  reasoning?: string;
}

/**
 * Pravidlá priority pre rôzne typy tagov
 */
const TAG_PRIORITY_RULES = {
  // AdvancedParser je lepší pre základné mená (má dictionary lookup)
  'krstné_meno': { preferred: 'advanced', weight: 0.8 },
  'priezvisko': { preferred: 'advanced', weight: 0.8 },
  
  // SystemTags je lepší pre komplexné rodinné vzťahy
  'manželka': { preferred: 'system', weight: 0.9 },
  'manžel': { preferred: 'system', weight: 0.9 },
  'manželka_rodné': { preferred: 'system', weight: 0.9 },
  'rodné_priezvisko': { preferred: 'system', weight: 0.7 },
  
  // SystemTags je lepší pre adresy a lokality
  'adresa': { preferred: 'system', weight: 0.9 },
  'lokalita': { preferred: 'system', weight: 0.8 },
  
  // AdvancedParser má lepšie gender detection
  'pohlavie': { preferred: 'advanced', weight: 0.85 },
  
  // Rodinné vzťahy - SystemTags
  'otec': { preferred: 'system', weight: 0.8 },
  'matka': { preferred: 'system', weight: 0.8 },
  'syn': { preferred: 'system', weight: 0.8 },
  'dcéra': { preferred: 'system', weight: 0.8 },
  
  // Default - rovnaká váha
  'default': { preferred: null, weight: 0.5 }
};

/**
 * Normalizuje hodnotu tagu pre porovnanie
 */
function normalizeTagValue(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Porovná podobnosť dvoch hodnôt tagov
 */
function calculateSimilarity(value1: string, value2: string): number {
  const norm1 = normalizeTagValue(value1);
  const norm2 = normalizeTagValue(value2);
  
  if (norm1 === norm2) return 1.0;
  
  // Jednoduchá Levenshtein distance
  const len1 = norm1.length;
  const len2 = norm2.length;
  const matrix = Array(len2 + 1).fill(null).map(() => Array(len1 + 1).fill(null));
  
  for (let i = 0; i <= len1; i++) matrix[0][i] = i;
  for (let j = 0; j <= len2; j++) matrix[j][0] = j;
  
  for (let j = 1; j <= len2; j++) {
    for (let i = 1; i <= len1; i++) {
      const indicator = norm1[i - 1] === norm2[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + indicator
      );
    }
  }
  
  const distance = matrix[len2][len1];
  const maxLen = Math.max(len1, len2);
  return maxLen === 0 ? 1 : 1 - (distance / maxLen);
}

/**
 * Získa váhu pre daný typ tagu
 */
function getTagWeight(tagKey: string, source: 'advanced' | 'system'): number {
  const rule = TAG_PRIORITY_RULES[tagKey] || TAG_PRIORITY_RULES.default;
  
  if (rule.preferred === source) {
    return rule.weight;
  } else if (rule.preferred === null) {
    return 0.5; // Neutrálna váha
  } else {
    return 1 - rule.weight; // Opačná váha
  }
}

/**
 * Zlúči tagy z oboch parserov
 */
export function mergeTags(
  advancedTags: any[],
  systemTags: any[]
): MergedTag[] {
  const mergedTags: MergedTag[] = [];
  const processedKeys = new Set<string>();
  
  // Konvertuj tagy na jednotný formát
  const advTags: TagWithSource[] = advancedTags.map(tag => ({
    key: tag.key || (tag.type === 'given' ? 'krstné_meno' : 
         tag.type === 'surname' ? 'priezvisko' : 'neznámy'),
    value: tag.value,
    confidence: tag.confidence || 0.5,
    source: 'advanced' as const,
    rule: tag.source_rule
  }));
  
  const sysTags: TagWithSource[] = systemTags.map(tag => ({
    key: tag.key,
    value: tag.value,
    confidence: tag.uncertain ? 0.3 : 0.7,
    source: 'system' as const,
    uncertain: tag.uncertain
  }));
  
  // Získaj všetky unikátne kľúče
  const allKeys = new Set([
    ...advTags.map(t => t.key),
    ...sysTags.map(t => t.key)
  ]);
  
  for (const key of allKeys) {
    if (processedKeys.has(key)) continue;
    processedKeys.add(key);
    
    const advTag = advTags.find(t => t.key === key);
    const sysTag = sysTags.find(t => t.key === key);
    
    if (advTag && sysTag) {
      // Máme tag z oboch zdrojov - porovnaj
      const similarity = calculateSimilarity(advTag.value, sysTag.value);
      
      if (similarity > 0.8) {
        // Hodnoty sú podobné - vyber lepší source
        const advWeight = getTagWeight(key, 'advanced') * advTag.confidence;
        const sysWeight = getTagWeight(key, 'system') * sysTag.confidence;
        
        const winner = advWeight > sysWeight ? advTag : sysTag;
        const loser = advWeight > sysWeight ? sysTag : advTag;
        
        mergedTags.push({
          key,
          value: winner.value,
          confidence: Math.max(advWeight, sysWeight),
          source: winner.source,
          alternatives: [loser],
          reasoning: `${winner.source} parser má vyššiu váhu pre ${key} (${advWeight.toFixed(2)} vs ${sysWeight.toFixed(2)})`
        });
      } else {
        // Hodnoty sú rozdielne - označiť konflikt
        const advWeight = getTagWeight(key, 'advanced') * advTag.confidence;
        const sysWeight = getTagWeight(key, 'system') * sysTag.confidence;
        
        const winner = advWeight > sysWeight ? advTag : sysTag;
        const loser = advWeight > sysWeight ? sysTag : advTag;
        
        mergedTags.push({
          key,
          value: winner.value,
          confidence: Math.max(advWeight, sysWeight) * 0.8, // Znížená confidence pre konflikt
          source: 'merged',
          alternatives: [loser],
          conflict: true,
          reasoning: `KONFLIKT: ${advTag.value} (ADV) vs ${sysTag.value} (SYS), podobnosť: ${(similarity * 100).toFixed(0)}%`
        });
      }
    } else if (advTag) {
      // Len AdvancedParser má tento tag
      mergedTags.push({
        key,
        value: advTag.value,
        confidence: advTag.confidence * getTagWeight(key, 'advanced'),
        source: 'advanced',
        reasoning: `Len AdvancedParser detekoval tento tag`
      });
    } else if (sysTag) {
      // Len SystemTags má tento tag
      mergedTags.push({
        key,
        value: sysTag.value,
        confidence: sysTag.confidence * getTagWeight(key, 'system'),
        source: 'system',
        reasoning: `Len SystemTags detekoval tento tag`
      });
    }
  }
  
  // Zoraď podľa confidence
  return mergedTags.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Získa najlepší tag pre daný kľúč
 */
export function getBestTag(mergedTags: MergedTag[], key: string): MergedTag | null {
  const candidates = mergedTags.filter(t => t.key === key);
  if (candidates.length === 0) return null;
  
  return candidates.reduce((best, current) => 
    current.confidence > best.confidence ? current : best
  );
}

/**
 * Získa všetky konflikty
 */
export function getConflicts(mergedTags: MergedTag[]): MergedTag[] {
  return mergedTags.filter(t => t.conflict === true);
}
