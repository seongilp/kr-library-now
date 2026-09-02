'use client';

import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';

import type { LatLon } from '@/lib/geo';
import type { SeatTone } from '@/lib/seat-status';

import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * 도서관 지도. MapLibre **v5** — v6 는 Turbopack 에서 워커 로딩이 실패해 지도가 조용히 안 뜬다
 * (메모리 기록). 좌표는 WGS84(lon,lat)를 info_v2 가 직접 준다.
 *
 * ★ 핀 색이 곧 이 앱의 값이다: 좌석 여유 상태(seatTone)를 색으로 구분한다. 캠핑앱은 색을 하나로
 *   통일했지만(위치만이 관심), 여기선 "어디가 지금 자리 있나"가 지도의 질문이라 색이 정보다.
 *   범례를 반드시 함께 둔다(색만 있고 범례 없으면 오히려 헷갈린다).
 *     초록=여유 · 주황=혼잡 · 빨강=만석 · 회색=실시간 미제공/갱신 안 됨
 */

export interface MapPoint {
  id: string;
  lon: number;
  lat: number;
  title: string;
  tone: SeatTone;
}

const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const KOREA_BOUNDS: [[number, number], [number, number]] = [
  [125.9, 33.1],
  [129.6, 38.6],
];
const FIT_PADDING = { top: 40, right: 40, bottom: 40, left: 40 };
const SOURCE = 'libraries';

/** 좌석 상태 → 핀 색. seat-status 의 SeatTone 과 1:1. */
const TONE_COLOR: Record<SeatTone, string> = {
  free: '#22c55e', // 초록 · 여유
  busy: '#f59e0b', // 주황 · 혼잡
  full: '#ef4444', // 빨강 · 만석
  stale: '#6b7280', // 회색 · 갱신 안 됨
  none: '#64748b', // 회색(약간 다른 톤) · 실시간 미제공
};

function toGeoJson(points: MapPoint[]): GeoJSON.FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { id: p.id, title: p.title, color: TONE_COLOR[p.tone] },
    })),
  };
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };

export function LibrariesMap({
  points,
  center,
  isUserLocation,
  selectedId,
  onSelect,
}: {
  points: MapPoint[];
  center: LatLon;
  isUserLocation: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const loadedRef = useRef(false);
  const fittedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const pointsRef = useRef(points);
  const centerRef = useRef(center);

  useEffect(() => void (onSelectRef.current = onSelect), [onSelect]);
  useEffect(() => void (pointsRef.current = points), [points]);
  useEffect(() => void (centerRef.current = center), [center]);

  /* 지도 생성 — 한 번만. */
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP_STYLE,
      bounds: KOREA_BOUNDS,
      fitBoundsOptions: { padding: FIT_PADDING },
      minZoom: 4,
      maxZoom: 18,
      attributionControl: false,
      localIdeographFontFamily: "'Noto Sans KR', 'Noto Sans', sans-serif",
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      map.addSource(SOURCE, { type: 'geojson', data: toGeoJson(pointsRef.current) });

      map.addLayer({
        id: 'lib-selected',
        type: 'circle',
        source: SOURCE,
        filter: ['==', ['get', 'id'], ''],
        paint: {
          'circle-radius': 14,
          'circle-color': 'transparent',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 3,
        },
      });
      map.addLayer({
        id: 'lib-point',
        type: 'circle',
        source: SOURCE,
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 5, 15, 9],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.92,
          'circle-stroke-color': '#0b0f19',
          'circle-stroke-width': 1.5,
        },
      });
      map.addLayer({
        id: 'lib-label',
        type: 'symbol',
        source: SOURCE,
        minzoom: 10,
        layout: {
          'text-field': ['get', 'title'],
          'text-size': 11,
          'text-offset': [0, 1.2],
          'text-anchor': 'top',
          'text-max-width': 9,
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#e5e7eb',
          'text-halo-color': '#0b0f19',
          'text-halo-width': 1.2,
        },
      });

      loadedRef.current = true;
      map.getSource<maplibregl.GeoJSONSource>(SOURCE)?.setData(toGeoJson(pointsRef.current));
    });

    for (const layer of ['lib-point', 'lib-label']) {
      map.on('click', layer, (e) => {
        const id = e.features?.[0]?.properties?.id as string | undefined;
        if (id) onSelectRef.current(id);
      });
      map.on('mouseenter', layer, () => void (map.getCanvas().style.cursor = 'pointer'));
      map.on('mouseleave', layer, () => void (map.getCanvas().style.cursor = ''));
    }

    // 0x0 으로 생성되면 줌이 굳는다. 실제 크기를 얻은 뒤 한 번 더 맞춘다.
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width < 1 || box.height < 1) return;
      map.resize();
      if (fittedRef.current) return;
      fittedRef.current = true;
      const c = centerRef.current;
      map.easeTo({ center: [c.lon, c.lat], zoom: 11, duration: 0 });
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
      fittedRef.current = false;
    };
  }, []);

  /* 포인트 갱신(좌석 색 포함). */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map.getSource<maplibregl.GeoJSONSource>(SOURCE)?.setData(points.length ? toGeoJson(points) : EMPTY);
  }, [points]);

  /* 중심 이동 + (실제 위치일 때만) 파란 '내 위치' 점. 폴백(서울)일 땐 안 찍는다(정직성). */
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let marker: maplibregl.Marker | null = null;
    if (isUserLocation) {
      const el = document.createElement('div');
      el.className = 'kr-user-dot';
      marker = new maplibregl.Marker({ element: el }).setLngLat([center.lon, center.lat]).addTo(map);
    }
    if (loadedRef.current && !fittedRef.current) {
      fittedRef.current = true;
      map.easeTo({ center: [center.lon, center.lat], zoom: 11, duration: 400 });
    }
    return () => void marker?.remove();
  }, [center, isUserLocation]);

  /* 선택 강조 + 화면으로 끌어오기. */
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loadedRef.current) return;
    map.setFilter('lib-selected', ['==', ['get', 'id'], selectedId ?? '']);
    if (!selectedId) return;
    const hit = pointsRef.current.find((p) => p.id === selectedId);
    if (hit) map.easeTo({ center: [hit.lon, hit.lat], zoom: Math.max(map.getZoom(), 13), duration: 500 });
  }, [selectedId]);

  return (
    <div className="relative size-full">
      <div ref={containerRef} className="size-full" />
      {/* 범례: 색이 정보이므로 반드시 둔다. */}
      <div className="pointer-events-none absolute bottom-2 left-2 flex flex-col gap-1 rounded-lg border border-border bg-card/90 px-2.5 py-2 text-[10px] text-muted-foreground backdrop-blur">
        <LegendDot color="#22c55e" label="여유" />
        <LegendDot color="#f59e0b" label="혼잡" />
        <LegendDot color="#ef4444" label="만석" />
        <LegendDot color="#64748b" label="실시간 미제공" />
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="size-2 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}
