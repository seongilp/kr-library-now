/**
 * 도서관 필터 — **순수 함수**(테스트가 붙는다). 커버리지가 얇고 수도권 편중이라, 필터는
 * "쓸모 있게 좁히는" 쪽으로 설계한다:
 *  - realtimeOnly : 실시간 좌석을 실제로 주는 곳만(미제공 제외)
 *  - availableOnly: 지금 잔여좌석이 1석 이상인 곳만(만석·미제공 제외) — 이 앱의 핵심 질문
 *  - openNowOnly  : 지금 여는 것으로 추정되는 곳만
 *  - ctpv         : 시도 선택(수도권 밖 사용자가 자기 지역만 보게)
 *
 * availableOnly 는 "만석"과 "미제공"을 둘 다 제외하되, 그 둘은 서로 다른 이유로 빠진다
 * (만석=값이 든 것, 미제공=값이 없는 것). 필터 판정에서만 함께 빠질 뿐, 표시에선 구분된다.
 */

import type { LibraryWithSeats, OpenStatus } from './libraries';
import { seatTone } from './seat-status';

export interface LibFilters {
  realtimeOnly: boolean;
  availableOnly: boolean;
  openNowOnly: boolean;
  ctpv: string | null;
}

export const EMPTY_LIB_FILTERS: LibFilters = {
  realtimeOnly: false,
  availableOnly: false,
  openNowOnly: false,
  ctpv: null,
};

export function hasAnyLibFilter(f: LibFilters): boolean {
  return f.realtimeOnly || f.availableOnly || f.openNowOnly || f.ctpv !== null;
}

/** 도서관이 필터 전부(AND)를 통과하는가. status 는 호출부가 계산해 넘긴다. */
export function matchesLibFilter(
  lib: LibraryWithSeats,
  status: OpenStatus,
  f: LibFilters,
): boolean {
  if (f.ctpv && lib.ctpv !== f.ctpv) return false;

  const tone = seatTone(lib.seats);
  if (f.realtimeOnly && (tone === 'none' || tone === 'stale')) return false;

  if (f.availableOnly) {
    // 지금 앉을 수 있는 곳: 잔여>0(free|busy). 만석·미제공·stale 제외.
    if (!(tone === 'free' || tone === 'busy')) return false;
  }

  if (f.openNowOnly && status !== 'open') return false;

  return true;
}
