// Utility funkcie pre mapy a geolokáciu

interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * Vytvára URL pre Google Maps s danou lokalitou
 */
export function createGoogleMapsUrl(locality: string, coordinates?: Coordinates): string {
  const baseUrl = 'https://www.google.com/maps/search/';
  
  if (coordinates) {
    // Ak máme koordináty, použijeme ich s lokalitou
    return `${baseUrl}${encodeURIComponent(locality)}/@${coordinates.lat},${coordinates.lng},15z`;
  } else {
    // Bez koordinátov len vyhľadaj lokalitu
    return `${baseUrl}${encodeURIComponent(locality + ', Slovensko')}`;
  }
}

/**
 * Vytvára URL pre ZBGIS kataster s LV detailom
 */
export function createZbgisLvUrl(poradie: number, lv: number, coordinates?: Coordinates): string {
  // Základné LV detail URL
  const baseUrl = `https://zbgis.skgeodesy.sk/mapka/sk/kataster/detail/kataster/list-vlastnictva/${poradie}/${lv}`;
  
  if (coordinates) {
    // Pridaj koordináty pre správny focus mapy
    return `${baseUrl}?pos=${coordinates.lat},${coordinates.lng},13`;
  } else {
    // Bez koordinátov len základné LV detail
    return baseUrl;
  }
}

/**
 * Vytvára URL pre ZBGIS kataster (všeobecná mapa)
 */
export function createZbgisUrl(coordinates?: Coordinates): string {
  const baseUrl = 'https://zbgis.skgeodesy.sk/mapka/sk/kataster';
  
  if (coordinates) {
    // Ak máme koordináty, použijeme ich
    return `${baseUrl}?pos=${coordinates.lat},${coordinates.lng},15`;
  } else {
    // Bez koordinátov otvoríme základnú mapu Slovenska
    return `${baseUrl}?pos=48.800000,19.530000,8`;
  }
}

/**
 * Cache pre uloženie koordinátov lokalít (aby sme neopakovali API volania)
 */
const coordinatesCache = new Map<string, Coordinates | null>();

/**
 * Pokúsi sa získať koordináty pre danú slovenskú lokalitu pomocou OpenStreetMap Nominatim API
 */
export async function getCoordinatesForLocality(locality: string): Promise<Coordinates | undefined> {
  if (!locality || locality.trim().length === 0) {
    return undefined;
  }

  const cleanLocality = locality.trim();
  
  // Skontroluj cache
  if (coordinatesCache.has(cleanLocality)) {
    const cached = coordinatesCache.get(cleanLocality);
    return cached || undefined;
  }

  try {
    // Vytvor query pre Nominatim API s dôrazom na Slovensko
    const query = encodeURIComponent(`${cleanLocality}, Slovakia`);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&countrycodes=sk&limit=1&addressdetails=1`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RegisterNeznámychVlastníkov/1.0' // Nominatim vyžaduje User-Agent
      }
    });

    if (!response.ok) {
      console.warn(`Nominatim API error: ${response.status}`);
      coordinatesCache.set(cleanLocality, null);
      return undefined;
    }

    const data = await response.json();
    
    if (data && data.length > 0) {
      const result = data[0];
      const coordinates: Coordinates = {
        lat: parseFloat(result.lat),
        lng: parseFloat(result.lon)
      };
      
      // Validácia či sú koordináty v Slovensku (približne)
      if (coordinates.lat >= 47.7 && coordinates.lat <= 49.6 && 
          coordinates.lng >= 16.8 && coordinates.lng <= 22.6) {
        coordinatesCache.set(cleanLocality, coordinates);
        return coordinates;
      } else {
        console.warn(`Coordinates outside Slovakia bounds for ${cleanLocality}:`, coordinates);
      }
    }
    
    // Ak nebol nájdený výsledok alebo je mimo Slovenska
    coordinatesCache.set(cleanLocality, null);
    return undefined;
    
  } catch (error) {
    console.warn(`Geocoding error for ${cleanLocality}:`, error);
    coordinatesCache.set(cleanLocality, null);
    return undefined;
  }
}

/**
 * Zistí či je dostupné Google Maps tlačidlo
 */
export function isGoogleMapsAvailable(locality: string): boolean {
  return Boolean(locality && locality.trim().length > 0);
}

/**
 * Vytvorí popis pre Google Maps tlačidlo
 */
export function createGoogleMapsDescription(locality: string): string {
  return `Otvoriť lokalitu "${locality}" v Google Maps`;
}

/**
 * Vytvorí popis pre ZBGIS LV tlačidlo
 */
export function createZbgisLvDescription(poradie: number, lv: number, hasCoordinates: boolean = false): string {
  if (hasCoordinates) {
    return `Otvoriť LV ${lv} (poradie ${poradie}) v ZBGIS katastri s presnou polohou`;
  } else {
    return `Otvoriť LV ${lv} (poradie ${poradie}) v ZBGIS katastri`;
  }
}

/**
 * Asynchrónne vytvorí ZBGIS LV URL s koordinátmi ak sú dostupné
 */
export async function createZbgisLvUrlWithCoordinates(poradie: number, lv: number, locality: string): Promise<{ url: string; hasCoordinates: boolean }> {
  try {
    const coordinates = await getCoordinatesForLocality(locality);
    return {
      url: createZbgisLvUrl(poradie, lv, coordinates || undefined),
      hasCoordinates: coordinates !== null
    };
  } catch (error) {
    console.warn(`Failed to get coordinates for ${locality}:`, error);
    return {
      url: createZbgisLvUrl(poradie, lv), // Fallback bez koordinátov
      hasCoordinates: false
    };
  }
}

/**
 * Vytvorí popis pre ZBGIS tlačidlo
 */
export function createZbgisDescription(locality: string, hasCoordinates: boolean): string {
  if (hasCoordinates) {
    return `Otvoriť lokalitu "${locality}" v ZBGIS katastri s presnou polohou`;
  } else {
    return `Otvoriť ZBGIS kataster (bez presnej polohy pre "${locality}")`;
  }
}

/**
 * Asynchrónne vytvorí ZBGIS URL s koordinátmi ak sú dostupné
 */
export async function createZbgisUrlWithCoordinates(locality: string): Promise<string> {
  try {
    const coordinates = await getCoordinatesForLocality(locality);
    return createZbgisUrl(coordinates);
  } catch (error) {
    console.warn(`Failed to get coordinates for ${locality}:`, error);
    return createZbgisUrl(); // Fallback bez koordinátov
  }
}

/**
 * Asynchrónne vytvorí Google Maps URL s koordinátmi ak sú dostupné
 */
export async function createGoogleMapsUrlWithCoordinates(locality: string): Promise<string> {
  try {
    const coordinates = await getCoordinatesForLocality(locality);
    return createGoogleMapsUrl(locality, coordinates);
  } catch (error) {
    console.warn(`Failed to get coordinates for ${locality}:`, error);
    return createGoogleMapsUrl(locality); // Fallback bez koordinátov
  }
}
