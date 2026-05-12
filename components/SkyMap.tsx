// === SkyMap ================================================================
// Live aircraft positions inside a 50 km box around the city center,
// from the OpenSky Network volunteer ADS-B receiver network. Refreshes
// every 60 seconds while the tab is visible; pauses when the user
// navigates away to preserve the per-IP credit quota.
//
// Loaded via dynamic import (ssr: false) by SkyMapLoader because
// MapLibre touches `window` at module load. The fetch is intentionally
// client-side: OpenSky's anonymous limit is 100 credits per IP per day,
// and routing through each visitor's browser distributes the quota
// across users rather than burning it from the server's egress IP.
//
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Map as MapView, Marker, Popup, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { COLORS } from '@/lib/colors';
import {
  boundingBoxAround,
  parseOpenSkyResponse,
  type Aircraft,
} from '@/lib/skyTraffic';

const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';
const OPENSKY_API = 'https://opensky-network.org/api/states/all';
const RADIUS_KM = 50;
const REFRESH_MS = 60_000;

type Props = {
  cityName: string;
  cityLat: number;
  cityLng: number;
};

type ErrorKind = 'rate_limit' | 'network' | 'parse' | null;

export default function SkyMap({ cityName, cityLat, cityLng }: Props) {
  const mapRef = useRef<MapRef | null>(null);
  const [aircraft, setAircraft] = useState<Aircraft[]>([]);
  const [snapshotTime, setSnapshotTime] = useState<number | null>(null);
  const [error, setError] = useState<ErrorKind>(null);
  const [selected, setSelected] = useState<Aircraft | null>(null);
  // Track wall-clock so the "Updated Xs ago" label re-renders even between
  // OpenSky fetches.
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  const fetchAircraft = useCallback(async () => {
    const bbox = boundingBoxAround(cityLat, cityLng, RADIUS_KM);
    const url =
      `${OPENSKY_API}?` +
      `lamin=${bbox.lamin.toFixed(4)}` +
      `&lomin=${bbox.lomin.toFixed(4)}` +
      `&lamax=${bbox.lamax.toFixed(4)}` +
      `&lomax=${bbox.lomax.toFixed(4)}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        setError(res.status === 429 ? 'rate_limit' : 'network');
        return;
      }
      const data = (await res.json()) as unknown;
      const parsed = parseOpenSkyResponse(data);
      if (!parsed) {
        setError('parse');
        return;
      }
      setAircraft(parsed.aircraft);
      setSnapshotTime(parsed.time);
      setError(null);
    } catch {
      setError('network');
    }
  }, [cityLat, cityLng]);

  // Poll on a 60-second interval, but only when the tab is visible.
  // OpenSky's anonymous limit is 100 credits/day per IP; a visible tab
  // chewing through 60 calls/hour will exhaust that in ~100 minutes, so
  // pausing when hidden is the polite default.
  useEffect(() => {
    fetchAircraft();
    let intervalId: ReturnType<typeof setInterval> | null = setInterval(
      fetchAircraft,
      REFRESH_MS,
    );
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (intervalId == null) {
          fetchAircraft();
          intervalId = setInterval(fetchAircraft, REFRESH_MS);
        }
      } else if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      if (intervalId != null) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchAircraft]);

  // Tick "now" every second so the age label stays current.
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const ageSec = snapshotTime != null ? Math.max(0, now - snapshotTime) : null;

  return (
    <div>
      <div className="rounded-lg overflow-hidden border border-sand h-[320px] mb-2 relative">
        <MapView
          ref={mapRef}
          initialViewState={{ latitude: cityLat, longitude: cityLng, zoom: 9 }}
          mapStyle={STYLE_URL}
          style={{ width: '100%', height: '100%' }}
        >
          {/* City center */}
          <Marker latitude={cityLat} longitude={cityLng} anchor="center">
            <div
              className="w-3 h-3 rounded-full bg-ink-deep ring-2 ring-white shadow"
              title={cityName}
              aria-label={cityName}
            />
          </Marker>

          {/* Aircraft markers — small triangle rotated to track heading */}
          {aircraft.map(a => {
            const isSelected = selected?.icao24 === a.icao24;
            return (
              <Marker key={a.icao24} latitude={a.lat} longitude={a.lng} anchor="center">
                <button
                  type="button"
                  onClick={() => setSelected(a)}
                  className="cursor-pointer block leading-none"
                  aria-label={`Aircraft ${a.callsign ?? a.icao24}`}
                >
                  <svg
                    width={isSelected ? 18 : 14}
                    height={isSelected ? 18 : 14}
                    viewBox="-7 -7 14 14"
                    style={{ transform: `rotate(${a.trackDeg}deg)` }}
                    aria-hidden="true"
                  >
                    <polygon
                      points="0,-6 4,5 0,2 -4,5"
                      fill={isSelected ? COLORS.inkDeep : COLORS.teal}
                      stroke={COLORS.white}
                      strokeWidth="0.6"
                    />
                  </svg>
                </button>
              </Marker>
            );
          })}

          {/* Selected aircraft popup */}
          {selected && (
            <Popup
              latitude={selected.lat}
              longitude={selected.lng}
              anchor="bottom"
              offset={12}
              closeOnClick={false}
              onClose={() => setSelected(null)}
            >
              <div className="text-small min-w-[140px]">
                <div className="font-mono font-semibold text-ink-deep">
                  {selected.callsign ?? selected.icao24}
                </div>
                <div className="text-muted text-micro mb-1">{selected.originCountry}</div>
                {selected.altitudeM != null && (
                  <div className="text-micro text-slate">
                    {Math.round(selected.altitudeM).toLocaleString()} m
                    {' · '}
                    {Math.round(selected.altitudeM * 3.281).toLocaleString()} ft
                  </div>
                )}
                {selected.velocityMs != null && (
                  <div className="text-micro text-slate">
                    {Math.round(selected.velocityMs * 3.6)} km/h
                    {' · '}
                    {Math.round(selected.velocityMs * 1.944)} kn
                  </div>
                )}
                <div className="text-micro text-muted mt-1">
                  ICAO {selected.icao24}
                </div>
              </div>
            </Popup>
          )}
        </MapView>
      </div>

      <div className="text-micro text-muted flex items-baseline justify-between gap-3 flex-wrap">
        <span>
          {error === 'rate_limit' ? (
            <>OpenSky rate limit hit; pausing until the daily window resets.</>
          ) : error ? (
            <>Live air traffic temporarily unavailable.</>
          ) : aircraft.length === 0 ? (
            <>No aircraft within 50 km right now.</>
          ) : (
            <>
              {aircraft.length} aircraft within 50 km. Click a marker for callsign,
              altitude, speed.
            </>
          )}
        </span>
        {ageSec != null && !error && (
          <span>
            Updated{' '}
            {ageSec < 60
              ? `${ageSec}s`
              : ageSec < 3600
                ? `${Math.floor(ageSec / 60)}m`
                : `${Math.floor(ageSec / 3600)}h`}{' '}
            ago
          </span>
        )}
      </div>
    </div>
  );
}
