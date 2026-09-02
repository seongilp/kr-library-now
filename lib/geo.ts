/**
 * 지리 계산 + 거리 정렬. 좌표는 전부 WGS84(lat=위도, lon=경도) — info_v2 가 lat/lot 로 직접 준다
 * (실측: 168곳 전부 한국범위, WGS84 이탈 0건).
 *
 * 도서관은 168곳으로 작아서 서버가 공간필터를 하지 않는다(전량을 클라이언트로 내려도 가볍다).
 * 대신 거리 정렬·반경 계산은 이 순수 함수들로 클라이언트에서 한다(테스트가 붙는다).
 */

const EARTH_RADIUS_KM = 6371;

export interface LatLon {
  lat: number;
  lon: number;
}

/**
 * 서울시청. 위치 권한이 없거나 거부됐을 때의 폴백 중심.
 * 실시간 좌석 도서관이 수도권에 몰려 있어(경기·서울 85%) 서울 폴백이 실제로도 무난하다.
 * 폴백임을 화면에 정직하게 밝힌다(usedFallback → '서울 기준').
 */
export const SEOUL: LatLon = { lat: 37.5665, lon: 126.978 };

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** 두 좌표 사이 대권 거리(km). 하버사인. */
export function haversineKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface Located {
  lat: number;
  lon: number;
}

export interface WithDistance<T> {
  item: T;
  distanceKm: number;
}

/** origin 에서 가까운 순으로 정렬하고 각 항목에 거리(km)를 붙인다. limit 로 개수를 자른다. */
export function nearest<T extends Located>(
  items: readonly T[],
  origin: LatLon,
  limit: number,
  maxKm?: number,
): WithDistance<T>[] {
  const scored: WithDistance<T>[] = [];
  for (const item of items) {
    const distanceKm = haversineKm(origin, { lat: item.lat, lon: item.lon });
    if (maxKm != null && distanceKm > maxKm) continue;
    scored.push({ item, distanceKm });
  }
  scored.sort((a, b) => a.distanceKm - b.distanceKm);
  return scored.slice(0, limit);
}
