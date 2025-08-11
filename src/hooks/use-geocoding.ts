import { useState, useEffect } from 'react';
import { getCoordinatesForLocality, createZbgisUrl, createZbgisLvUrl, createGoogleMapsUrl } from '@/lib/map-utils';

interface Coordinates {
  lat: number;
  lng: number;
}

interface GeocodingResult {
  coordinates: Coordinates | null;
  zbgisUrl: string;
  zbgisLvUrl?: string;
  googleMapsUrl: string;
  loading: boolean;
  hasCoordinates: boolean;
}

/**
 * Vytvára ZBGIS LV URL s koordinátmi
 */
function createZbgisLvUrlForResult(poradie: number, lv: number, coordinates: Coordinates | null): string {
  return createZbgisLvUrl(poradie, lv, coordinates || undefined);
}

/**
 * Hook pre geocoding lokalít a generovanie URL s koordinátmi
 */
export function useGeocoding(locality: string): GeocodingResult {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!locality || locality.trim().length === 0) {
      setCoordinates(null);
      setLoading(false);
      return;
    }

    const fetchCoordinates = async () => {
      setLoading(true);
      try {
        const coords = await getCoordinatesForLocality(locality.trim());
        setCoordinates(coords || null);
      } catch (error) {
        console.warn(`Geocoding failed for ${locality}:`, error);
        setCoordinates(null);
      } finally {
        setLoading(false);
      }
    };

    fetchCoordinates();
  }, [locality]);

  // Generuj URL-ky na základe dostupných koordinátov
  const zbgisUrl = createZbgisUrl(coordinates || undefined);
  const googleMapsUrl = createGoogleMapsUrl(locality, coordinates || undefined);
  const hasCoordinates = coordinates !== null;

  return {
    coordinates,
    zbgisUrl,
    googleMapsUrl,
    loading,
    hasCoordinates
  };
}

/**
 * Hook pre batch geocoding viacerých lokalít naraz (optimalizácia pre tabuľky)
 */
export function useBatchGeocoding(localities: string[]): Map<string, GeocodingResult> {
  const [results, setResults] = useState<Map<string, GeocodingResult>>(new Map());

  useEffect(() => {
    const uniqueLocalities = [...new Set(localities.filter(l => l && l.trim().length > 0))];
    
    const fetchAllCoordinates = async () => {
      const newResults = new Map<string, GeocodingResult>();
      
      // Inicializuj loading states
      uniqueLocalities.forEach(locality => {
        newResults.set(locality, {
          coordinates: null,
          zbgisUrl: createZbgisUrl(),
          googleMapsUrl: createGoogleMapsUrl(locality),
          loading: true,
          hasCoordinates: false
        });
      });
      
      setResults(new Map(newResults));

      // Fetch coordinates pre každú lokalitu
      await Promise.allSettled(
        uniqueLocalities.map(async (locality) => {
          try {
            const coords = await getCoordinatesForLocality(locality.trim());
            const hasCoordinates = coords !== null;
            
            newResults.set(locality, {
              coordinates: coords || null,
              zbgisUrl: createZbgisUrl(coords || undefined),
              googleMapsUrl: createGoogleMapsUrl(locality, coords || undefined),
              loading: false,
              hasCoordinates
            });
          } catch (error) {
            console.warn(`Geocoding failed for ${locality}:`, error);
            newResults.set(locality, {
              coordinates: null,
              zbgisUrl: createZbgisUrl(),
              googleMapsUrl: createGoogleMapsUrl(locality),
              loading: false,
              hasCoordinates: false
            });
          }
        })
      );

      setResults(new Map(newResults));
    };

    if (uniqueLocalities.length > 0) {
      fetchAllCoordinates();
    }
  }, [localities.join(',')]); // Dependency na string reprezentáciu

  return results;
}
