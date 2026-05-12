// === AirportsView ==========================================================
// Interactive panel for the "airports near this city" section on city
// detail pages. MapLibre map on top with one labeled marker per airport,
// a clickable card grid below, and a detail block for the currently
// selected airport.
//
// Click a marker → selects that airport in the list.
// Click a list card → selects it on the map.
// Default selection is the closest airport.
//
// Loaded via dynamic import (ssr: false) by AirportsViewLoader because
// MapLibre touches `window` at module load.
//
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Map as MapView, Marker, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { AirportWithDistance } from '@/lib/airports';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

type Props = {
  cityName: string;
  cityLat: number;
  cityLng: number;
  airports: AirportWithDistance[];
};

export default function AirportsView({
  cityName,
  cityLat,
  cityLng,
  airports,
}: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [selectedIdent, setSelectedIdent] = useState<string | null>(
    airports[0]?.ident ?? null,
  );

  const bounds = useMemo(() => {
    if (airports.length === 0) return null;
    const lats = [cityLat, ...airports.map(a => a.lat)];
    const lngs = [cityLng, ...airports.map(a => a.lng)];
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }, [cityLat, cityLng, airports]);

  const fitToBounds = useCallback(() => {
    if (!bounds || !mapRef.current) return;
    mapRef.current.fitBounds(
      [
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat],
      ],
      { padding: 50, duration: 0 },
    );
  }, [bounds]);

  useEffect(() => {
    fitToBounds();
  }, [fitToBounds]);

  const selected = airports.find(a => a.ident === selectedIdent) ?? null;

  return (
    <div>
      <div className="rounded-lg overflow-hidden border border-sand h-[320px] mb-4">
        <MapView
          ref={mapRef}
          initialViewState={{ latitude: cityLat, longitude: cityLng, zoom: 8 }}
          mapStyle={STYLE_URL}
          style={{ width: '100%', height: '100%' }}
        >
          {/* City center pin */}
          <Marker latitude={cityLat} longitude={cityLng} anchor="center">
            <div
              className="w-3 h-3 rounded-full bg-ink-deep ring-2 ring-white shadow"
              title={cityName}
              aria-label={cityName}
            />
          </Marker>

          {/* Airport markers, IATA label inside a pill. Large airports get
              a slightly wider pill so they read at a glance. */}
          {airports.map(a => {
            const isSelected = a.ident === selectedIdent;
            const isLarge = a.type === 'large_airport';
            const label = a.iata ?? a.ident;
            const sizeClass = isLarge ? 'h-6 px-2 min-w-[40px]' : 'h-5 px-1.5 min-w-[34px]';
            const stateClass = isSelected
              ? 'bg-teal text-white border-white shadow-md scale-110'
              : 'bg-white text-ink-deep border-teal hover:scale-105';
            return (
              <Marker
                key={a.ident}
                latitude={a.lat}
                longitude={a.lng}
                anchor="center"
              >
                <button
                  type="button"
                  onClick={() => setSelectedIdent(a.ident)}
                  className={`cursor-pointer transition-all rounded-full border-2 font-mono font-semibold text-micro flex items-center justify-center ${sizeClass} ${stateClass}`}
                  aria-label={`${a.name} (${label})`}
                >
                  {label}
                </button>
              </Marker>
            );
          })}
        </MapView>
      </div>

      {/* Airport card grid. Selected card is highlighted; click any to switch. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 mb-4">
        {airports.map(a => {
          const isSelected = a.ident === selectedIdent;
          return (
            <button
              type="button"
              key={a.ident}
              onClick={() => setSelectedIdent(a.ident)}
              className={`text-left p-3 rounded-lg border transition-colors ${
                isSelected
                  ? 'border-teal bg-cream'
                  : 'border-sand bg-cream-soft hover:bg-cream'
              }`}
            >
              <div className="flex items-baseline gap-2 mb-1">
                <span className="font-mono font-semibold text-ink-deep">
                  {a.iata ?? a.ident}
                </span>
                <span className="text-micro text-muted">
                  {a.distanceKm.toFixed(0)} km
                </span>
              </div>
              <div className="text-small text-slate line-clamp-2">{a.name}</div>
            </button>
          );
        })}
      </div>

      {/* Selected detail */}
      {selected && (
        <div className="card p-4">
          <div className="flex items-baseline justify-between mb-2 gap-3 flex-wrap">
            <h3 className="font-mono font-semibold text-ink-deep">
              {selected.iata ? `${selected.iata} ` : ''}
              <span className="text-slate font-normal">({selected.ident})</span>
            </h3>
            <span className="text-small text-muted">
              {selected.distanceKm.toFixed(1)} km from {cityName}
            </span>
          </div>
          <div className="text-small text-ink-deep mb-2">{selected.name}</div>
          <div className="text-micro text-muted flex flex-wrap gap-x-3 gap-y-1">
            <span>
              {selected.type === 'large_airport'
                ? 'Large international'
                : 'Medium regional'}
            </span>
            {selected.municipality && <span>{selected.municipality}</span>}
            {selected.elevation_ft != null && (
              <span>{selected.elevation_ft} ft elevation</span>
            )}
            {selected.wikipedia_link && (
              <a
                href={selected.wikipedia_link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal hover:underline"
              >
                Wikipedia
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
