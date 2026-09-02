import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { EMPTY_LIB_FILTERS, matchesLibFilter } from '../lib-filters';
import type { LibrarySeats, LibraryWithSeats, OpenStatus } from '../libraries';

const seats = (remain: number, total = 100): LibrarySeats => ({
  rooms: [],
  totalSeats: total,
  totalRemain: remain,
  measuredRooms: 1,
  updatedAt: '20260902150700',
  stale: false,
});

const lib = (over: Partial<LibraryWithSeats>): LibraryWithSeats => ({
  id: 'x',
  name: '테스트도서관',
  type: '공공도서관',
  ctpv: '경기도',
  sgg: '성남시',
  region: '경기도 성남시',
  addr: null,
  lat: 37.4,
  lon: 127.1,
  tel: null,
  siteUrl: null,
  closedInfo: null,
  hours: { weekday: { begin: null, end: null }, weekend: { begin: null, end: null }, holiday: { begin: null, end: null } },
  seatTotalDir: null,
  distanceKm: 1,
  seats: null,
  ...over,
});

describe('matchesLibFilter', () => {
  const open: OpenStatus = 'open';

  it('빈 필터는 전부 통과', () => {
    assert.equal(matchesLibFilter(lib({}), open, EMPTY_LIB_FILTERS), true);
  });

  it('availableOnly: 만석·미제공은 제외, 여유만 통과', () => {
    const f = { ...EMPTY_LIB_FILTERS, availableOnly: true };
    assert.equal(matchesLibFilter(lib({ seats: seats(30) }), open, f), true); // 여유
    assert.equal(matchesLibFilter(lib({ seats: seats(0) }), open, f), false); // 만석
    assert.equal(matchesLibFilter(lib({ seats: null }), open, f), false); // 미제공
  });

  it('realtimeOnly: 미제공·stale 제외', () => {
    const f = { ...EMPTY_LIB_FILTERS, realtimeOnly: true };
    assert.equal(matchesLibFilter(lib({ seats: seats(0) }), open, f), true); // 만석도 실시간 제공은 맞음
    assert.equal(matchesLibFilter(lib({ seats: null }), open, f), false);
  });

  it('openNowOnly: open 만 통과', () => {
    const f = { ...EMPTY_LIB_FILTERS, openNowOnly: true };
    assert.equal(matchesLibFilter(lib({}), 'open', f), true);
    assert.equal(matchesLibFilter(lib({}), 'closed_today', f), false);
    assert.equal(matchesLibFilter(lib({}), 'unknown', f), false);
  });

  it('ctpv: 시도 일치만', () => {
    const f = { ...EMPTY_LIB_FILTERS, ctpv: '서울특별시' };
    assert.equal(matchesLibFilter(lib({ ctpv: '경기도' }), open, f), false);
    assert.equal(matchesLibFilter(lib({ ctpv: '서울특별시' }), open, f), true);
  });
});
