// Карта (Leaflet + тайлы OpenStreetMap): точка ресторана в админке и точка доставки при оформлении.
// Библиотека подгружается только когда карта впервые нужна — основное приложение от неё не тяжелеет.
import React, { useEffect, useRef, useState } from 'react';

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/';
let loading = null;
export function loadLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  loading ||= new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = `${LEAFLET}leaflet.css`;
    document.head.appendChild(css);
    const s = document.createElement('script');
    s.src = `${LEAFLET}leaflet.js`;
    s.onload = () => resolve(window.L);
    s.onerror = () => { loading = null; reject(new Error('Карта не загрузилась. Проверьте интернет')); };
    document.head.appendChild(s);
  });
  return loading;
}

// Адрес по координатам (OpenStreetMap Nominatim). Не получилось — пустая строка.
export async function reverseGeocode({ lat, lng }) {
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&accept-language=ru`, { signal: AbortSignal.timeout?.(5000) });
    const a = (await r.json()).address || {};
    const city = a.city || a.town || a.village || a.state || '';
    const street = [a.road || a.pedestrian || a.neighbourhood || a.suburb, a.house_number].filter(Boolean).join(', ');
    return [city, street].filter(Boolean).join(', ');
  } catch { return ''; }
}

const pin = (L, cls) => L.divIcon({ className: '', html: `<span class="map-pin ${cls}"></span>`, iconSize: [30, 38], iconAnchor: [15, 36] });
const ZONE_COLORS = ['#17A058', '#F5A20F', '#FF5A00', '#D12D1F', '#7B3FE4'];
export const zoneColor = (i) => ZONE_COLORS[i % ZONE_COLORS.length];

// value — выбранная точка (перетаскиваемая метка), origin — ресторан, zones — круги зон вокруг ресторана.
// Тап по карте или перенос метки вызывает onChange({ lat, lng }).
export function MapPicker({ value, onChange, origin, zones = [], height = 280, pinClass = 'client' }) {
  const box = useRef(null);
  const map = useRef(null);
  const layers = useRef(null);
  const marker = useRef(null);
  const changeRef = useRef(onChange);
  changeRef.current = onChange;
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let dead = false;
    loadLeaflet().then((L) => {
      if (dead || !box.current) return;
      const start = value || origin || { lat: 41.3111, lng: 69.2797 };
      const m = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], value ? 15 : 12);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
      layers.current = L.layerGroup().addTo(m);
      m.on('click', (e) => changeRef.current?.({ lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) }));
      map.current = m;
      setReady(true);
      setTimeout(() => m.invalidateSize(), 250); // карта в шторке: размер известен после анимации
    }).catch((e) => setErr(e.message));
    return () => { dead = true; map.current?.remove(); map.current = null; marker.current = null; };
  }, []);

  // Метка выбранной точки
  useEffect(() => {
    const L = window.L, m = map.current;
    if (!ready || !L || !m) return;
    if (!value) { marker.current?.remove(); marker.current = null; return; }
    if (!marker.current) {
      marker.current = L.marker([value.lat, value.lng], { draggable: true, icon: pin(L, pinClass), zIndexOffset: 1000 }).addTo(m);
      marker.current.on('dragend', () => { const p = marker.current.getLatLng(); changeRef.current?.({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) }); });
    } else marker.current.setLatLng([value.lat, value.lng]);
    if (!m.getBounds().pad(-0.1).contains([value.lat, value.lng])) m.panTo([value.lat, value.lng]);
  }, [ready, value?.lat, value?.lng]);

  // Ресторан и зоны доставки (круги от большего к меньшему)
  const zonesKey = JSON.stringify([origin, zones.map((z) => z.maxKm)]);
  useEffect(() => {
    const L = window.L;
    if (!ready || !L || !layers.current) return;
    layers.current.clearLayers();
    if (!origin) return;
    [...zones].map((z, i) => ({ z, i })).sort((a, b) => b.z.maxKm - a.z.maxKm).forEach(({ z, i }) => {
      if (z.maxKm > 0) L.circle([origin.lat, origin.lng], { radius: z.maxKm * 1000, color: zoneColor(i), weight: 1.5, fillOpacity: 0.07, interactive: false }).addTo(layers.current);
    });
    if (pinClass !== 'shop') L.marker([origin.lat, origin.lng], { icon: pin(L, 'shop'), interactive: false }).addTo(layers.current);
  }, [ready, zonesKey]);

  const fit = () => {
    const L = window.L, m = map.current;
    if (!L || !m || !origin) return;
    const far = Math.max(1, ...zones.map((z) => z.maxKm || 0));
    m.fitBounds(L.latLng(origin.lat, origin.lng).toBounds(far * 2000), { padding: [12, 12] });
  };

  return (
    <div className="map-box" style={{ height }}>
      <div ref={box} className="map-canvas" />
      {!ready && <div className="map-state">{err || 'Загружаем карту…'}</div>}
      {ready && origin && zones.length > 0 && <button type="button" className="map-fit" onClick={fit}>Все зоны</button>}
    </div>
  );
}
