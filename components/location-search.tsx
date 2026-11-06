import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin } from 'lucide-react';

export type SearchResult = {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  name: string;
  type: string;
};

type Props = {
  value: string;
  onChange: (val: string) => void;
  onSelect: (lat: number, lng: number, name: string) => void;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
};

export function LocationSearch({ value, onChange, onSelect, placeholder = "Buscar ubicación...", className = "", style }: Props) {
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const lastSelectedRef = useRef<string>(value);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const searchPlaces = async () => {
      if (value.trim().length < 3 || value === lastSelectedRef.current) {
        setResults([]);
        return;
      }
      setIsLoading(true);
      try {
        const res = await fetch(`/api/geocoding?q=${encodeURIComponent(value.trim())}`);
        const data = await res.json();
        if (Array.isArray(data)) {
          setResults(data);
          setIsOpen(true);
        } else {
          setResults([]);
        }
      } catch (err) {
        console.error("Error searching location:", err);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    };

    const timeoutId = setTimeout(() => {
      searchPlaces();
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [value]);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', width: '100%', zIndex: 50, ...style }} className={className}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search style={{ position: 'absolute', left: 12, color: 'var(--muted)', width: 18, height: 18 }} />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => { if (results.length > 0) setIsOpen(true); }}
          placeholder={placeholder}
          style={{
            width: '100%',
            padding: '10px 12px 10px 40px',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            background: 'var(--background)',
            color: 'var(--foreground)',
            outline: 'none',
          }}
        />
        {isLoading && (
          <div style={{ position: 'absolute', right: 12, width: 16, height: 16, border: '2px solid var(--border)', borderTopColor: 'var(--pine)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: 4,
          background: 'var(--paper)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          zIndex: 9999,
          maxHeight: 250,
          overflowY: 'auto'
        }}>
          {results.map((result) => (
            <button
              key={result.place_id}
              type="button"
              style={{
                width: '100%',
                padding: '12px 16px',
                display: 'flex',
                alignItems: 'flex-start',
                gap: 12,
                background: 'transparent',
                border: 'none',
                borderBottom: '1px solid var(--border)',
                textAlign: 'left',
                cursor: 'pointer',
                color: 'var(--foreground)'
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--sand)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              onClick={() => {
                const name = result.name || result.display_name.split(',')[0];
                lastSelectedRef.current = name;
                onChange(name);
                setIsOpen(false);
                onSelect(parseFloat(result.lat), parseFloat(result.lon), name);
              }}
            >
              <MapPin style={{ width: 16, height: 16, color: 'var(--pine)', marginTop: 2, flexShrink: 0 }} />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 500, fontSize: 14 }}>{result.name || result.display_name.split(',')[0]}</span>
                <span style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {result.display_name}
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
