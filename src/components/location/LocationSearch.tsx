import { useState, useRef, useEffect, useCallback } from 'react';
import { MapPin, Search, Loader2, Navigation, X, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface LocationResult {
  address: string;
  latitude: number;
  longitude: number;
}

interface NominatimPlace {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
}

/* ── Nominatim helpers ──────────────────────────────────────────────────── */

const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';

async function searchPlaces(query: string, signal?: AbortSignal): Promise<NominatimPlace[]> {
  if (!query.trim() || query.trim().length < 2) return [];

  const url = new URL(`${NOMINATIM_BASE}/search`);
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', '5');
  url.searchParams.set('countrycodes', 'in'); // Bias to India — remove for global

  const res = await fetch(url.toString(), {
    signal,
    headers: { 'Accept-Language': 'en' },
  });
  if (!res.ok) throw new Error('Location search failed');
  return res.json();
}

async function reverseGeocode(lat: number, lon: number): Promise<string> {
  const url = new URL(`${NOMINATIM_BASE}/reverse`);
  url.searchParams.set('lat', lat.toString());
  url.searchParams.set('lon', lon.toString());
  url.searchParams.set('format', 'json');

  try {
    const res = await fetch(url.toString(), {
      headers: { 'Accept-Language': 'en' },
    });
    if (!res.ok) return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
    const data = await res.json();
    return data.display_name || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
}

/* ── Component ──────────────────────────────────────────────────────────── */

interface LocationSearchProps {
  value: LocationResult | null;
  onChange: (location: LocationResult | null) => void;
}

export function LocationSearch({ value, onChange }: LocationSearchProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<NominatimPlace[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searching, setSearching] = useState(false);
  const [gpsLoading, setGpsLoading] = useState(false);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced search
  const handleQueryChange = useCallback((text: string) => {
    setQuery(text);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (text.trim().length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setSearching(true);
      try {
        const places = await searchPlaces(text, controller.signal);
        if (!controller.signal.aborted) {
          setSuggestions(places);
          setShowDropdown(places.length > 0);
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 350);
  }, []);

  // Select a suggestion
  const handleSelect = (place: NominatimPlace) => {
    const result: LocationResult = {
      address: place.display_name,
      latitude: parseFloat(place.lat),
      longitude: parseFloat(place.lon),
    };
    onChange(result);
    setQuery(place.display_name);
    setShowDropdown(false);
    setSuggestions([]);
  };

  // Use current GPS location
  const handleGPS = () => {
    const isLocalhost =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '::1';
    const hasSecureContext = window.location.protocol === 'https:' || isLocalhost;

    if (!hasSecureContext) {
      toast.error('Location requires HTTPS or localhost');
      return;
    }
    if (!('geolocation' in navigator)) {
      toast.error('Geolocation not supported in this browser');
      return;
    }

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        const address = await reverseGeocode(latitude, longitude);
        const result: LocationResult = { address, latitude, longitude };
        onChange(result);
        setQuery(address);
        setGpsLoading(false);
        toast.success('Location captured!');
      },
      (err) => {
        setGpsLoading(false);
        if (err.code === err.PERMISSION_DENIED) toast.error('Location permission denied');
        else if (err.code === err.POSITION_UNAVAILABLE) toast.error('Location unavailable');
        else if (err.code === err.TIMEOUT) toast.error('Location request timed out');
        else toast.error('Could not get location');
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 0 }
    );
  };

  // Clear selection
  const handleClear = () => {
    onChange(null);
    setQuery('');
    setSuggestions([]);
    setShowDropdown(false);
    inputRef.current?.focus();
  };

  // Shorten display names for dropdown
  const shortenName = (name: string) => {
    const parts = name.split(', ');
    if (parts.length <= 3) return name;
    return `${parts[0]}, ${parts[1]}, ${parts[parts.length - 2]}, ${parts[parts.length - 1]}`;
  };

  return (
    <div ref={wrapperRef} className="space-y-3">
      {/* Search input */}
      <div className="relative">
        <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
          {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
        </div>
        <Input
          ref={inputRef}
          placeholder="Search location — area, street, landmark..."
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onFocus={() => { if (suggestions.length > 0) setShowDropdown(true); }}
          className="h-12 rounded-xl border-border/60 bg-muted/30 pl-10 pr-10 text-sm focus:bg-card"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        {/* Dropdown */}
        {showDropdown && suggestions.length > 0 && (
          <div className="absolute z-50 mt-1.5 w-full overflow-hidden rounded-xl border border-border/60 bg-card shadow-xl shadow-black/10 animate-in fade-in-0 slide-in-from-top-1 duration-150">
            {suggestions.map((place) => (
              <button
                key={place.place_id}
                type="button"
                onClick={() => handleSelect(place)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-primary/5 border-b border-border/20 last:border-0"
              >
                <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
                <span className="text-foreground/90 leading-snug">{shortenName(place.display_name)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* GPS button */}
      <Button
        type="button"
        variant="outline"
        className="w-full gap-2 rounded-xl border-border/60 h-11 text-sm"
        onClick={handleGPS}
        disabled={gpsLoading}
      >
        {gpsLoading
          ? <Loader2 className="h-4 w-4 animate-spin" />
          : <Navigation className="h-4 w-4" />
        }
        Use Current Location
      </Button>

      {/* Selected location display */}
      {value && (
        <div className="flex items-start gap-3 rounded-xl border border-green-500/30 bg-green-500/5 p-3">
          <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground leading-snug truncate">{shortenName(value.address)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
            </p>
          </div>
          <button type="button" onClick={handleClear} className="rounded-full p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
