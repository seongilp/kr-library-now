/**
 * 좌석 여유 상태 판정 — **순수 함수**(테스트가 붙는다). 지도 핀 색·카드 배지의 근거.
 *
 * ★ 이 앱 최악의 반복 결함 방지(팀 지시): 잔여 0(만석)과 "실시간 미제공"을 절대 같게 다루지 않는다.
 *   - none  : 좌석 정보 자체가 없음(실시간 미제공 도서관). 회색.
 *   - stale : 실시간 연계가 끊겨 값이 오늘 것이 아님. 회색 + 경고.
 *   - full  : 측정됐고 잔여 0 = 만석. 빨강.
 *   - busy  : 잔여가 매우 적음(≤10%). 주황.
 *   - free  : 여유 있음. 초록.
 *  none 과 full 은 색까지 다르다 — "자리 없음"과 "정보 없음"이 눈으로 갈린다.
 */

import type { LibrarySeats } from './libraries';

export type SeatTone = 'none' | 'stale' | 'full' | 'busy' | 'free';

export function seatTone(seats: LibrarySeats | null): SeatTone {
  if (!seats) return 'none';
  if (seats.stale) return 'stale';
  if (seats.measuredRooms === 0) return 'none'; // 방은 있으나 잔여 측정값이 없음 = 정보 없음
  if (seats.totalRemain <= 0) return 'full';
  const ratio = seats.totalSeats > 0 ? seats.totalRemain / seats.totalSeats : 1;
  if (ratio < 0.1) return 'busy';
  return 'free';
}

/** 한 줄 요약 라벨. 값과 결측을 다른 문장으로. */
export function seatSummary(seats: LibrarySeats | null): string {
  const tone = seatTone(seats);
  switch (tone) {
    case 'none':
      return '실시간 좌석 미제공';
    case 'stale':
      return '실시간 갱신 안 됨';
    case 'full':
      return '만석 · 잔여 0석';
    case 'busy':
    case 'free':
      return `잔여 ${seats!.totalRemain.toLocaleString()}석`;
  }
}
