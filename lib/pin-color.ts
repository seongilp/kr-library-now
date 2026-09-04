/**
 * 지도 핀 색 — **순수 함수**(테스트가 붙는다). 좌석 tone 이 있으면 그걸 우선하고,
 * 실시간 좌석이 없는(none/stale) 도서관은 회색 한 색으로 뭉뚱그리지 않는다 —
 * 운영시간 기준으로 "지금 열려 있을 것"이면 초록, 아니면 회색으로 나눈다.
 *
 * ★ 배경: 실시간 좌석은 수도권 123곳뿐이라 나머지 대다수가 회색 핀이었고, 그게 "닫혀 있다"로
 *   오독됐다(팀 지시로 수정). 좌석 free 초록과는 지도 레이어에서 테두리로만 구분한다 —
 *   색 자체를 늘리면 범례가 다시 헷갈린다.
 */

import type { OpenStatus } from './libraries';
import type { SeatTone } from './seat-status';

export const PIN_GREEN = '#22c55e'; // 여유 · 운영 중(추정)
export const PIN_AMBER = '#f59e0b'; // 혼잡
export const PIN_RED = '#ef4444'; // 만석
export const PIN_GRAY = '#64748b'; // 닫힘·정보 없음

export function pinColor(tone: SeatTone, status: OpenStatus): string {
  if (tone === 'free') return PIN_GREEN;
  if (tone === 'busy') return PIN_AMBER;
  if (tone === 'full') return PIN_RED;
  // tone === 'none' | 'stale' — 실시간 좌석이 없다. 운영시간 기준으로만 판단한다.
  return status === 'open' ? PIN_GREEN : PIN_GRAY;
}

/** 좌석값 없이 운영시간만으로 "열림"을 추정한 핀인가 — 지도에서 테두리로 구분할 때 쓴다. */
export function isEstimatedOpenPin(tone: SeatTone, status: OpenStatus): boolean {
  return (tone === 'none' || tone === 'stale') && status === 'open';
}
