import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { PIN_GRAY, PIN_GREEN, isEstimatedOpenPin, pinColor } from '../pin-color';

describe('pinColor — 좌석 tone 우선, 없으면 운영시간(OpenStatus) 기준', () => {
  it('좌석 free/busy/full 은 tone 색을 그대로 쓴다(status 무관)', () => {
    assert.equal(pinColor('free', 'closed_today'), PIN_GREEN);
    assert.equal(pinColor('busy', 'open'), '#f59e0b');
    assert.equal(pinColor('full', 'open'), '#ef4444');
  });

  it('실시간 미제공(none) + 지금 열림 → 초록(회색으로 "닫힘" 오독 방지)', () => {
    assert.equal(pinColor('none', 'open'), PIN_GREEN);
  });

  it('실시간 미제공(none) + 닫힘/불명 → 회색', () => {
    assert.equal(pinColor('none', 'closed_today'), PIN_GRAY);
    assert.equal(pinColor('none', 'before_open'), PIN_GRAY);
    assert.equal(pinColor('none', 'after_close'), PIN_GRAY);
    assert.equal(pinColor('none', 'unknown'), PIN_GRAY);
  });

  it('stale(갱신 끊김) + 지금 열림 → 초록', () => {
    assert.equal(pinColor('stale', 'open'), PIN_GREEN);
  });

  it('stale + 닫힘 → 회색', () => {
    assert.equal(pinColor('stale', 'closed_today'), PIN_GRAY);
  });
});

describe('isEstimatedOpenPin — 좌석값 없이 운영시간만으로 "열림" 추정했는가', () => {
  it('none/stale + open 일 때만 true', () => {
    assert.equal(isEstimatedOpenPin('none', 'open'), true);
    assert.equal(isEstimatedOpenPin('stale', 'open'), true);
  });
  it('실측 tone(free/busy/full)은 추정이 아니다', () => {
    assert.equal(isEstimatedOpenPin('free', 'open'), false);
    assert.equal(isEstimatedOpenPin('busy', 'open'), false);
    assert.equal(isEstimatedOpenPin('full', 'open'), false);
  });
  it('닫힘/불명이면 false', () => {
    assert.equal(isEstimatedOpenPin('none', 'closed_today'), false);
    assert.equal(isEstimatedOpenPin('none', 'unknown'), false);
  });
});
