import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { seatTone, seatSummary } from '../seat-status';
import type { LibrarySeats } from '../libraries';

const mk = (over: Partial<LibrarySeats>): LibrarySeats => ({
  rooms: [],
  totalSeats: 100,
  totalRemain: 50,
  measuredRooms: 2,
  updatedAt: '20260902150700',
  stale: false,
  ...over,
});

describe('seatTone — 만석·미제공·여유를 색으로 가른다', () => {
  it('좌석 없음(null) → none', () => {
    assert.equal(seatTone(null), 'none');
    assert.equal(seatSummary(null), '실시간 좌석 미제공');
  });
  it('측정된 방 0 → none(정보 없음)', () => {
    assert.equal(seatTone(mk({ measuredRooms: 0 })), 'none');
  });
  it('stale → stale', () => {
    assert.equal(seatTone(mk({ stale: true })), 'stale');
  });
  it('잔여 0 → full(만석, none 과 다르다)', () => {
    assert.equal(seatTone(mk({ totalRemain: 0 })), 'full');
    assert.equal(seatSummary(mk({ totalRemain: 0 })), '만석 · 잔여 0석');
  });
  it('잔여 매우 적음(<10%) → busy', () => {
    assert.equal(seatTone(mk({ totalSeats: 100, totalRemain: 5 })), 'busy');
  });
  it('여유 → free', () => {
    assert.equal(seatTone(mk({ totalSeats: 100, totalRemain: 50 })), 'free');
    assert.equal(seatSummary(mk({ totalRemain: 50 })), '잔여 50석');
  });
  it('none 과 full 은 절대 같은 tone 이 아니다(핵심 결함 방지)', () => {
    assert.notEqual(seatTone(null), seatTone(mk({ totalRemain: 0 })));
  });
});
