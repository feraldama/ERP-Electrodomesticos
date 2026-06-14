"use client";

import { useEffect, useRef, useState } from "react";
import "leaflet/dist/leaflet.css";
import type { Map as LMap, Marker as LMarker, LeafletMouseEvent } from "leaflet";
import { MapPin, Search, LocateFixed, X, Loader2 } from "lucide-react";

// Centro por defecto: Asuncion, Paraguay
const DEFAULT_CENTER: [number, number] = [-25.2818, -57.635];

interface Props {
  lat: number | null;
  lng: number | null;
  onChange: (lat: number | null, lng: number | null) => void;
  address?: string;
  height?: number;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

// Pin SVG como divIcon (evita el problema de assets de los iconos por defecto de Leaflet)
function pinIcon(L: typeof import("leaflet")) {
  return L.divIcon({
    className: "",
    html: `<svg width="30" height="40" viewBox="0 0 24 24" fill="#059669" stroke="#ffffff" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 3px rgba(0,0,0,.35))"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="#ffffff" stroke="none"/></svg>`,
    iconSize: [30, 40],
    iconAnchor: [15, 40],
  });
}

export function LocationPicker({ lat, lng, onChange, address, height = 280 }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LMap | null>(null);
  const markerRef = useRef<LMarker | null>(null);
  const LRef = useRef<typeof import("leaflet") | null>(null);
  // onChange en ref para no re-inicializar el mapa
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [geoLoading, setGeoLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(
    lat != null && lng != null ? { lat, lng } : null
  );

  function setMarker(latitude: number, longitude: number, recenter = false) {
    const L = LRef.current;
    const map = mapRef.current;
    if (!L || !map) return;
    if (markerRef.current) {
      markerRef.current.setLatLng([latitude, longitude]);
    } else {
      const m = L.marker([latitude, longitude], { draggable: true, icon: pinIcon(L) }).addTo(map);
      m.on("dragend", () => {
        const ll = m.getLatLng();
        const la = round(ll.lat);
        const lo = round(ll.lng);
        setCoords({ lat: la, lng: lo });
        onChangeRef.current(la, lo);
      });
      markerRef.current = m;
    }
    if (recenter) map.setView([latitude, longitude], Math.max(map.getZoom(), 16));
  }

  // Inicializacion del mapa (una sola vez)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default ?? (await import("leaflet"));
      if (cancelled || !containerRef.current || mapRef.current) return;
      LRef.current = L;
      const start: [number, number] = lat != null && lng != null ? [lat, lng] : DEFAULT_CENTER;
      const map = L.map(containerRef.current, { scrollWheelZoom: true }).setView(start, lat != null ? 16 : 12);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);
      mapRef.current = map;

      if (lat != null && lng != null) setMarker(lat, lng);

      map.on("click", (e: LeafletMouseEvent) => {
        const la = round(e.latlng.lat);
        const lo = round(e.latlng.lng);
        setMarker(la, lo);
        setCoords({ lat: la, lng: lo });
        onChangeRef.current(la, lo);
      });

      // El modal anima al abrir: recalculamos tamano para que no queden tiles grises
      setTimeout(() => map.invalidateSize(), 250);
    })();
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Geocodificar la direccion escrita (Nominatim / OpenStreetMap)
  async function buscarDireccion() {
    const q = (address ?? "").trim();
    if (!q) {
      setInfo("Escribi una direccion primero.");
      return;
    }
    setGeoLoading(true);
    setInfo(null);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=py&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { "Accept-Language": "es" } });
      const data = (await res.json()) as Array<{ lat: string; lon: string }>;
      if (!data.length) {
        setInfo("No se encontro la direccion. Marcala manualmente en el mapa.");
        return;
      }
      const la = round(Number(data[0].lat));
      const lo = round(Number(data[0].lon));
      setMarker(la, lo, true);
      setCoords({ lat: la, lng: lo });
      onChangeRef.current(la, lo);
    } catch {
      setInfo("No se pudo buscar la direccion. Marcala manualmente en el mapa.");
    } finally {
      setGeoLoading(false);
    }
  }

  // Usar la ubicacion actual del dispositivo
  function miUbicacion() {
    if (!navigator.geolocation) {
      setInfo("El navegador no permite geolocalizacion.");
      return;
    }
    setGeoLoading(true);
    setInfo(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = round(pos.coords.latitude);
        const lo = round(pos.coords.longitude);
        setMarker(la, lo, true);
        setCoords({ lat: la, lng: lo });
        onChangeRef.current(la, lo);
        setGeoLoading(false);
      },
      () => {
        setInfo("No se pudo obtener tu ubicacion.");
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  function limpiar() {
    if (markerRef.current && mapRef.current) {
      mapRef.current.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    setCoords(null);
    setInfo(null);
    onChangeRef.current(null, null);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={buscarDireccion}
          disabled={geoLoading}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-muted disabled:opacity-60"
        >
          {geoLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Buscar direccion
        </button>
        <button
          type="button"
          onClick={miUbicacion}
          disabled={geoLoading}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-secondary transition-colors hover:bg-muted disabled:opacity-60"
        >
          <LocateFixed className="h-3.5 w-3.5" />
          Mi ubicacion
        </button>
        {coords && (
          <button
            type="button"
            onClick={limpiar}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
          >
            <X className="h-3.5 w-3.5" />
            Quitar marcador
          </button>
        )}
        <span className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500">
          <MapPin className="h-3.5 w-3.5 text-accent" />
          {coords ? `${coords.lat}, ${coords.lng}` : "Sin ubicacion"}
        </span>
      </div>

      <div
        ref={containerRef}
        style={{ height }}
        className="w-full overflow-hidden rounded-xl border border-border bg-muted"
        role="application"
        aria-label="Mapa para marcar la ubicacion"
      />
      <p className="text-xs text-slate-400">
        Hace clic en el mapa para marcar la ubicacion exacta, o arrastra el marcador para ajustarla.
      </p>
      {info && <p className="text-xs text-amber-600">{info}</p>}
    </div>
  );
}
