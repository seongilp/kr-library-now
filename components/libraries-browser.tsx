'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Armchair, BookOpen, Clock, Loader2, MapPin, RefreshCw, Search } from 'lucide-react';

import type { LatLon } from '@/lib/geo';
import { SEOUL, haversineKm, nearest } from '@/lib/geo';
import {
  openStatus,
  type Library,
  type LibrarySeats,
  type LibraryWithSeats,
  type OpenStatus,
} from '@/lib/libraries';
import {
  EMPTY_LIB_FILTERS,
  hasAnyLibFilter,
  matchesLibFilter,
  type LibFilters,
} from '@/lib/lib-filters';
import type { LibrariesResponse, SeatsResponse } from '@/lib/types';
import { cn } from '@/lib/utils';
import { LibraryCard } from '@/components/library-card';
import { LibraryDetail } from '@/components/library-detail';
import { LibrariesMap, type FlyTarget, type MapPoint, type Viewport } from '@/components/libraries-map';
import { CommandPalette } from '@/components/command-palette';
import { seatTone } from '@/lib/seat-status';

/** 위치 상태(무한 로딩 금지). */
type GeoState =
  | { kind: 'locating' }
  | { kind: 'granted'; at: LatLon }
  | { kind: 'denied' }
  | { kind: 'unavailable' }
  | { kind: 'unsupported' };

/** 도서관 목록(정적) 로딩 상태. */
type LibState =
  | { kind: 'loading' }
  | { kind: 'error'; code?: string }
  | { kind: 'ready'; data: LibrariesResponse };

/** 좌석(실시간) 로딩 상태. 실패해도 목록은 살아 있어야 하므로 별도로 둔다. */
type SeatState =
  | { kind: 'loading' }
  | { kind: 'error'; code?: string }
  | { kind: 'ready'; data: SeatsResponse };

const SEAT_REFRESH_MS = 60_000; // 좌석 자동 갱신 주기(서버 TTL 과 맞춤).

export function LibrariesBrowser() {
  const [libState, setLibState] = useState<LibState>({ kind: 'loading' });
  const [seatState, setSeatState] = useState<SeatState>({ kind: 'loading' });
  const [geo, setGeo] = useState<GeoState>({ kind: 'locating' });
  const [filters, setFilters] = useState<LibFilters>(EMPTY_LIB_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  // 지도가 보이는 영역. 목록은 이 bounds 로 거르고 center 기준으로 정렬한다(이동마다 서버 호출 없음).
  const [viewport, setViewport] = useState<Viewport | null>(null);
  // 사용자가 지도를 한 번이라도 직접 움직였는가(헤더 문구·거리 표시 판단). 한 번 true 면 유지.
  const [mapInteracted, setMapInteracted] = useState(false);
  // "가장 가까운 도서관 보기" 등으로 지도를 이동시키는 명령.
  const [flyTo, setFlyTo] = useState<FlyTarget | null>(null);
  // 좌석 재계산·'지금 여는가'를 시간에 따라 갱신하기 위한 tick(자동 갱신마다 올린다).
  const [, setTick] = useState(0);
  const paletteOpenRef = useRef(paletteOpen);
  useEffect(() => void (paletteOpenRef.current = paletteOpen), [paletteOpen]);

  const hasRealLocation = geo.kind === 'granted';
  const origin: LatLon = geo.kind === 'granted' ? geo.at : SEOUL;

  /* 위치 요청(1회). 거부/불가/미지원을 각각 다른 상태로, 어느 경우든 서울 폴백. */
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      // 브라우저 지오로케이션(외부 시스템) 미지원을 상태에 반영 — 의도된 동기화.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGeo({ kind: 'unsupported' });
      return;
    }
    let alive = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (alive) setGeo({ kind: 'granted', at: { lat: pos.coords.latitude, lon: pos.coords.longitude } });
      },
      (err) => {
        if (!alive) return;
        setGeo({ kind: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' });
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
    return () => void (alive = false);
  }, []);

  const requestLocation = () => {
    setGeo({ kind: 'locating' });
    navigator.geolocation.getCurrentPosition(
      (pos) => setGeo({ kind: 'granted', at: { lat: pos.coords.latitude, lon: pos.coords.longitude } }),
      (err) => setGeo({ kind: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  /* 도서관 목록(정적) — 1회 로드. */
  const loadLibraries = useCallback(() => {
    setLibState({ kind: 'loading' });
    fetch('/api/libraries')
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { code?: string };
          throw Object.assign(new Error('upstream'), { code: body.code });
        }
        return r.json() as Promise<LibrariesResponse>;
      })
      .then((json) => setLibState({ kind: 'ready', data: json }))
      .catch((e: { code?: string }) => setLibState({ kind: 'error', code: e?.code }));
  }, []);

  /* 좌석(실시간) — 로드 + 주기 갱신. 실패해도 목록은 유지. */
  const loadSeats = useCallback(() => {
    fetch('/api/seats')
      .then(async (r) => {
        if (!r.ok) {
          const body = (await r.json().catch(() => ({}))) as { code?: string };
          throw Object.assign(new Error('upstream'), { code: body.code });
        }
        return r.json() as Promise<SeatsResponse>;
      })
      .then((json) => setSeatState({ kind: 'ready', data: json }))
      .catch((e: { code?: string }) => setSeatState((prev) => (prev.kind === 'ready' ? prev : { kind: 'error', code: e?.code })));
  }, []);

  // 마운트 시 도서관 목록(외부 API)을 1회 로드 — 데이터 소스와의 동기화라 의도된 setState.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => loadLibraries(), [loadLibraries]);
  useEffect(() => {
    loadSeats();
    const t = setInterval(() => {
      loadSeats();
      setTick((n) => n + 1);
    }, SEAT_REFRESH_MS);
    return () => clearInterval(t);
  }, [loadSeats]);

  const libraries: Library[] = libState.kind === 'ready' ? libState.data.libraries : [];
  const libMeta = libState.kind === 'ready' ? libState.data.meta : null;
  const seatMap: Record<string, LibrarySeats> = seatState.kind === 'ready' ? seatState.data.seats : {};
  const seatMeta = seatState.kind === 'ready' ? seatState.data.meta : null;

  /* 정렬·거리의 기준점: 지도를 움직였으면 지도 중심, 아니면 내 위치(또는 서울 폴백). */
  const reference: LatLon = viewport
    ? { lat: viewport.centerLat, lon: viewport.centerLon }
    : origin;

  /* 병합: 도서관 + 좌석 + 기준점까지의 거리 + '지금 여는가'. 기준점 기준 거리순 정렬. */
  const merged = useMemo(() => {
    const rows = libraries.map((lib) => {
      const seats = seatMap[lib.id] ?? null;
      const distanceKm = Math.round(haversineKm(reference, { lat: lib.lat, lon: lib.lon }) * 10) / 10;
      const row: { lib: LibraryWithSeats; status: OpenStatus } = {
        lib: { ...lib, distanceKm, seats },
        status: openStatus(lib),
      };
      return row;
    });
    rows.sort((a, b) => a.lib.distanceKm - b.lib.distanceKm);
    return rows;
    // seatState/기준점이 바뀌면 재계산. tick 은 시간 경과 반영.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraries, seatState, reference.lat, reference.lon]);

  /* 필터(패싯) 통과분 — 지도 핀과 "가장 가까운 곳" 탐색의 모집단. bounds 로는 아직 안 자른다. */
  const facetFiltered = useMemo(
    () => merged.filter((r) => matchesLibFilter(r.lib, r.status, filters)),
    [merged, filters],
  );

  /* 목록 = 필터 통과분 중 '지금 보이는 영역(bounds)' 안. viewport 가 아직 없으면 전체(초기 순간). */
  const inView = useMemo(() => {
    if (!viewport) return facetFiltered;
    return facetFiltered.filter(
      (r) =>
        r.lib.lon >= viewport.west &&
        r.lib.lon <= viewport.east &&
        r.lib.lat >= viewport.south &&
        r.lib.lat <= viewport.north,
    );
  }, [facetFiltered, viewport]);

  /* 핀은 필터 통과분 전체를 그린다(지도를 옮기면 이미 그려진 핀이 화면에 들어온다). */
  const points: MapPoint[] = useMemo(
    () =>
      facetFiltered.map((r) => ({
        id: r.lib.id,
        lon: r.lib.lon,
        lat: r.lib.lat,
        title: r.lib.name,
        tone: seatTone(r.lib.seats),
        // 지도 핀도 카드와 같은 status 값을 쓴다(따로 계산해 어긋나지 않게) — openStatus() 호출은
        // 위 merged 계산에서 한 번만 한다.
        status: r.status,
      })),
    [facetFiltered],
  );

  const selected = merged.find((r) => r.lib.id === selectedId) ?? null;

  /* 지도 이동/줌 종료(디바운스됨) → 보이는 영역 갱신. 사용자가 직접 움직였으면 상호작용 플래그를 켠다. */
  const onViewport = useCallback((v: Viewport) => {
    setViewport(v);
    if (v.interacted) setMapInteracted(true);
  }, []);

  /* 현재 기준점에서 가장 가까운(필터 통과) 도서관으로 지도를 이동 — 빈 영역일 때 탈출구. */
  const flyToNearest = useCallback(() => {
    const near = nearest(
      facetFiltered.map((r) => ({ lat: r.lib.lat, lon: r.lib.lon })),
      reference,
      1,
    );
    if (near.length > 0) setFlyTo({ lat: near[0].item.lat, lon: near[0].item.lon, nonce: Date.now() });
    // reference 는 매 렌더 새 객체라 원시값(lat/lon)으로 의존한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facetFiltered, reference.lat, reference.lon]);

  /* ⌘K 토글. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ESC: 상세 닫기(팔레트가 위에 있으면 팔레트가 먼저 먹음, 입력창 포커스 시 무시). */
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || paletteOpenRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return;
      setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  const selectFromPalette = useCallback((id: string) => {
    setPaletteOpen(false);
    setSelectedId(id);
  }, []);

  const regions = libMeta?.byRegion ?? [];
  const providing = seatMeta?.providing ?? null;
  // 거리를 표시할지: 내 실제 위치가 있거나, 사용자가 지도를 직접 움직였을 때(그 중심이 기준).
  const showDistance = hasRealLocation || mapInteracted;
  // 목록이 비었는데(bounds 안 0곳) 필터 통과분은 다른 지역에 있는가 → "가장 가까운 곳 보기" 탈출구.
  const emptyButExistsElsewhere =
    libState.kind === 'ready' && inView.length === 0 && facetFiltered.length > 0;

  return (
    <div className="flex h-dvh flex-col">
      {/* 상단 바 */}
      <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <Link href="/" className="flex items-center gap-2 text-sm font-bold">
          <BookOpen className="size-4 text-primary" />
          도서관나우
        </Link>
        <div className="flex items-center gap-2">
          {providing != null && (
            <span className="hidden text-[11px] text-muted-foreground sm:inline">
              실시간 {providing}곳
            </span>
          )}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            aria-label="도서관 검색 및 필터 열기"
          >
            <Search className="size-3.5" />
            <span className="hidden sm:inline">검색</span>
            <kbd className="hidden rounded border border-border bg-muted px-1 font-sans text-[10px] sm:inline">⌘K</kbd>
          </button>
        </div>
      </header>

      {/* 빠른 필터 칩 */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2">
        <div className="scrollbar-none flex gap-1.5 overflow-x-auto">
          <Chip
            active={filters.availableOnly}
            tone="emerald"
            onClick={() => setFilters((f) => ({ ...f, availableOnly: !f.availableOnly }))}
          >
            <Armchair className="size-3" />
            지금 자리 있음
          </Chip>
          <Chip
            active={filters.realtimeOnly}
            onClick={() => setFilters((f) => ({ ...f, realtimeOnly: !f.realtimeOnly }))}
          >
            실시간 제공
          </Chip>
          <Chip
            active={filters.openNowOnly}
            tone="amber"
            onClick={() => setFilters((f) => ({ ...f, openNowOnly: !f.openNowOnly }))}
          >
            <Clock className="size-3" />
            지금 열림
          </Chip>
          {filters.ctpv && (
            <Chip active tone="primary" onClick={() => setFilters((f) => ({ ...f, ctpv: null }))}>
              <MapPin className="size-3" />
              {filters.ctpv} ✕
            </Chip>
          )}
          {hasAnyLibFilter(filters) && (
            <button
              type="button"
              onClick={() => setFilters(EMPTY_LIB_FILTERS)}
              className="ml-1 shrink-0 rounded-full px-2 py-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {/* 위치 배너 */}
      {geo.kind !== 'granted' && geo.kind !== 'locating' && (
        <div className="flex items-center gap-2 border-b border-border bg-amber-500/10 px-4 py-2 text-xs text-amber-300">
          <MapPin className="size-3.5 shrink-0" />
          <span className="flex-1">
            {geo.kind === 'denied'
              ? '위치 권한이 거부되어 서울 기준으로 보여줍니다.'
              : geo.kind === 'unsupported'
                ? '이 브라우저는 위치를 지원하지 않아 서울 기준으로 보여줍니다.'
                : '위치를 확인할 수 없어 서울 기준으로 보여줍니다.'}
          </span>
          {geo.kind !== 'unsupported' && (
            <button
              type="button"
              onClick={requestLocation}
              className="shrink-0 rounded-full border border-amber-400/40 px-2 py-0.5 font-medium hover:bg-amber-400/10"
            >
              내 위치로
            </button>
          )}
        </div>
      )}

      {/* 본체: 데스크톱 좌우 분할(목록 좌측 고정폭 + 지도 우측 전폭), 모바일 지도 위/리스트 아래. */}
      <div className="flex min-h-0 w-full flex-1 flex-col sm:flex-row-reverse">
        {/* 지도 */}
        <div className="relative h-[42dvh] w-full shrink-0 sm:h-auto sm:flex-1">
          {libState.kind === 'ready' && (
            <LibrariesMap
              points={points}
              center={origin}
              isUserLocation={hasRealLocation}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onViewport={onViewport}
              flyTo={flyTo}
            />
          )}
          {libState.kind === 'loading' && (
            <div className="flex size-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {geo.kind === 'locating' ? '내 위치 확인 중…' : '도서관 불러오는 중…'}
            </div>
          )}
          {libState.kind === 'error' && (
            <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-sm">
              <AlertCircle className="size-6 text-destructive" />
              <p className="text-muted-foreground">지금 도서관 정보를 불러오지 못했습니다.</p>
              <button
                type="button"
                onClick={loadLibraries}
                className="rounded-full border border-border px-3 py-1 text-xs hover:bg-accent"
              >
                다시 시도
              </button>
            </div>
          )}
        </div>

        {/* 리스트 */}
        <div className="flex min-h-0 flex-1 flex-col sm:w-[26rem] sm:flex-none sm:border-r sm:border-border">
          <div className="flex items-baseline justify-between px-4 py-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">
              {mapInteracted ? '이 지도 영역' : '주변 도서관'}
            </span>
            {libState.kind === 'ready' && (
              <span>
                {inView.length}곳
                {mapInteracted ? ' · 지도 중심 순' : hasRealLocation ? ' · 가까운 순' : ' · 서울 기준'}
              </span>
            )}
          </div>

          {/* 커버리지 정직 고지: 실시간 제공 도서관 수 + 편중. */}
          {seatMeta && (
            <p className="px-4 pb-1 text-[11px] leading-relaxed text-muted-foreground">
              실시간 좌석 제공 {seatMeta.providing}곳
              {seatMeta.byRegion.length > 0 && (
                <>
                  {' '}· {seatMeta.byRegion.slice(0, 3).map((r) => `${r.ctpv} ${r.count}`).join(', ')} 등 수도권 위주
                </>
              )}
              {seatMeta.updatedAt && (
                <span className="inline-flex items-center gap-1">
                  {' '}
                  <RefreshCw className="size-2.5" />
                  {fmtClock(seatMeta.updatedAt)} 갱신
                </span>
              )}
            </p>
          )}
          {seatState.kind === 'error' && (
            <p className="px-4 pb-1 text-[11px] text-amber-300">
              실시간 좌석을 잠시 불러오지 못했습니다(운영시간·위치는 정상).
            </p>
          )}
          {/* 지도 핀 색은 좌석이 없으면 운영시간 추정으로 "열림"을 표시한다 — 그 추정의 한계 고지. */}
          <p className="px-4 pb-1 text-[11px] text-muted-foreground">
            운영시간표 기준 추정 · 휴관·임시휴관은 방문 전 확인
          </p>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 pb-4">
            {libState.kind === 'ready' && inView.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <BookOpen className="size-8 text-muted-foreground/50" />
                {emptyButExistsElsewhere ? (
                  <>
                    <p className="text-sm font-medium">이 지도 영역에는 도서관이 없습니다.</p>
                    <p className="text-xs text-muted-foreground">
                      실시간 좌석 제공 도서관은 경기·서울 등 수도권에 몰려 있습니다.
                    </p>
                    <button
                      type="button"
                      onClick={flyToNearest}
                      className="mt-1 rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      가장 가까운 도서관 보기
                    </button>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium">
                      {hasAnyLibFilter(filters) ? '이 조건에 맞는 도서관이 없습니다.' : '도서관이 없습니다.'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {hasAnyLibFilter(filters)
                        ? '필터를 줄이거나 초기화해 보세요. 실시간 좌석은 수도권 위주입니다.'
                        : '잠시 후 다시 시도해 보세요.'}
                    </p>
                  </>
                )}
              </div>
            )}
            {inView.map((r) => (
              <LibraryCard
                key={r.lib.id}
                lib={r.lib}
                status={r.status}
                usedFallback={!showDistance}
                selected={r.lib.id === selectedId}
                onSelect={() => setSelectedId(r.lib.id)}
              />
            ))}
            {libState.kind === 'loading' &&
              geo.kind !== 'locating' &&
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-[84px] animate-pulse rounded-xl bg-muted" />
              ))}
          </div>

          {/* 좌표 없는 도서관 고지(실측상 0곳이지만 방어적으로). */}
          {libMeta && libMeta.noCoords > 0 && (
            <p className="border-t border-border px-4 py-1.5 text-[11px] text-muted-foreground">
              좌표가 없어 지도에 표시하지 못한 도서관 {libMeta.noCoords}곳은 목록에서 제외됩니다.
            </p>
          )}
        </div>
      </div>

      {/* 상세 시트 */}
      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-20 sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[26rem]">
          <LibraryDetail
            lib={selected.lib}
            status={selected.status}
            usedFallback={!showDistance}
            onClose={() => setSelectedId(null)}
          />
        </div>
      )}

      {/* 커맨드 팔레트 */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        libraries={libState.kind === 'ready' ? libraries : null}
        loading={libState.kind === 'loading'}
        filters={filters}
        setFilters={setFilters}
        regions={regions}
        onSelectLibrary={selectFromPalette}
      />
    </div>
  );
}

/* ── 작은 UI 조각 ─────────────────────────────────────────────── */

function Chip({
  active,
  tone = 'primary',
  onClick,
  children,
}: {
  active: boolean;
  tone?: 'primary' | 'emerald' | 'amber';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const activeCls =
    tone === 'emerald'
      ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-400'
      : tone === 'amber'
        ? 'border-amber-500/50 bg-amber-500/15 text-amber-400'
        : 'border-primary bg-primary text-primary-foreground';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? activeCls : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/** YYYYMMDDHHMMSS → "HH:MM". */
function fmtClock(v: string): string {
  return /^\d{12,14}$/.test(v) ? `${v.slice(8, 10)}:${v.slice(10, 12)}` : v.slice(0, 12);
}
