import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aggregateSeats,
  isClosedToday,
  itemsOf,
  joinSeats,
  libId,
  normalizeLibrary,
  openStatus,
  parseApiError,
  parseHhmmss,
  totalOf,
  type Library,
  type LibraryRaw,
  type RoomRaw,
} from '../libraries';
import type { KstNow } from '../kst';

/** 실측 표본을 본뜬 info_v2 한 행. */
const rawLib: LibraryRaw = {
  pblibNm: '광진정보도서관',
  stdgCd: '1121500000',
  lclgvNm: '서울특별시 광진구',
  ctpvNm: '서울특별시',
  sggNm: '광진구',
  pblibTypeNm: '공공도서관',
  pblibRoadNmAddr: '서울특별시 광진구 아차산로78길 90',
  pblibTelno: '0234375092',
  siteUrlAddr: 'https://www.gwangjinlib.seoul.kr',
  lat: '37.5510735500',
  lot: '127.1106137000',
  clsrInfoExpln: '둘째 주 화+넷째 주 화+공휴일',
  wkdyOperBgngTm: '090000',
  wkdyOperEndTm: '180000',
  wkndOperBgngTm: '090000',
  wkndOperEndTm: '170000',
  tseatCnt: '458',
};

describe('normalizeLibrary — 좌표·식별', () => {
  it('정상 행을 정규화한다', () => {
    const lib = normalizeLibrary(rawLib)!;
    assert.equal(lib.id, '서울특별시 광진구|광진정보도서관');
    assert.equal(lib.ctpv, '서울특별시');
    assert.equal(lib.lat, 37.55107355);
    assert.equal(lib.lon, 127.1106137);
    assert.equal(lib.hours.weekday.begin, '0900');
    assert.equal(lib.hours.weekday.end, '1800');
  });

  it('좌표가 없으면 null(지도에 못 찍음)', () => {
    assert.equal(normalizeLibrary({ ...rawLib, lat: '', lot: '' }), null);
  });

  it('한국 밖 좌표(0,0 등)는 null', () => {
    assert.equal(normalizeLibrary({ ...rawLib, lat: '0', lot: '0' }), null);
  });

  it('이름이 없으면 null', () => {
    assert.equal(normalizeLibrary({ ...rawLib, pblibNm: '' }), null);
  });
});

describe('parseHhmmss — 운영시간 형식 방어', () => {
  it('090000 → 0900', () => assert.equal(parseHhmmss('090000'), '0900'));
  it('빈 값/비정형은 null(결측을 값인 척 안 함)', () => {
    assert.equal(parseHhmmss(''), null);
    assert.equal(parseHhmmss('운영'), null);
    assert.equal(parseHhmmss('9시'), null);
    assert.equal(parseHhmmss('250000'), null); // 시가 범위 밖
  });
});

describe('aggregateSeats — 만석(0)과 결측을 절대 혼동하지 않음', () => {
  const now = new Date('2026-09-02T06:07:00Z').getTime(); // KST 15:07
  const rooms: RoomRaw[] = [
    { lclgvNm: '서울특별시 광진구', pblibNm: '광진정보도서관', rdrmId: 'A', rdrmNm: '제1열람실', tseatCnt: '229', useSeatCnt: '229', rmndSeatCnt: '0', totDt: '20260902150700' }, // 만석
    { lclgvNm: '서울특별시 광진구', pblibNm: '광진정보도서관', rdrmId: 'B', rdrmNm: '제2열람실', tseatCnt: '100', useSeatCnt: '40', rmndSeatCnt: '60', totDt: '20260902150700' },
    { lclgvNm: '서울특별시 광진구', pblibNm: '광진정보도서관', rdrmId: 'C', rdrmNm: '개인석', tseatCnt: '', useSeatCnt: '', rmndSeatCnt: '', totDt: '20260902150700' }, // 결측
  ];

  it('측정된 방만 합산한다(결측은 0으로 세지 않음)', () => {
    const map = aggregateSeats(rooms, now);
    const s = map.get('서울특별시 광진구|광진정보도서관')!;
    assert.equal(s.rooms.length, 3);
    assert.equal(s.measuredRooms, 2); // A(0)와 B(60)만 측정. C는 결측.
    assert.equal(s.totalRemain, 60); // 0 + 60
    assert.equal(s.totalSeats, 329); // 229 + 100 (C 제외)
    assert.equal(s.stale, false);
  });

  it('만석 방의 remain 은 0(값), 결측 방의 remain 은 null', () => {
    const map = aggregateSeats(rooms, now);
    const s = map.get('서울특별시 광진구|광진정보도서관')!;
    assert.equal(s.rooms[0].remain, 0); // 만석: 값
    assert.equal(s.rooms[2].remain, null); // 결측: null
  });

  it('totDt 가 오늘이 아니면 stale', () => {
    const stale = aggregateSeats(
      [{ ...rooms[1], totDt: '20260107175620' }],
      now,
    ).get('서울특별시 광진구|광진정보도서관')!;
    assert.equal(stale.stale, true);
  });
});

describe('joinSeats — 미제공은 seats=null', () => {
  it('좌석 없는 도서관은 null(만석과 구분)', () => {
    const lib = normalizeLibrary(rawLib)!;
    const joined = joinSeats([lib], new Map());
    assert.equal(joined[0].seats, null);
  });
  it('좌석 있는 도서관은 집계가 붙는다', () => {
    const lib = normalizeLibrary(rawLib)!;
    const seats = aggregateSeats([
      { lclgvNm: '서울특별시 광진구', pblibNm: '광진정보도서관', rdrmNm: 'x', tseatCnt: '10', rmndSeatCnt: '3', totDt: '20260902150700' },
    ]);
    const joined = joinSeats([lib], seats);
    assert.equal(joined[0].seats?.totalRemain, 3);
  });
});

describe('parseApiError / itemsOf / totalOf — 세 응답 구조', () => {
  it('정상(K0) 은 에러 아님', () => {
    const ok = { response: { header: { resultCode: 'K0' }, body: { totalCount: 2, items: { item: [{ pblibNm: 'a' }, { pblibNm: 'b' }] } } } };
    assert.equal(parseApiError(ok), null);
    assert.equal(totalOf(ok), 2);
    assert.equal(itemsOf(ok).length, 2);
  });
  it('body.item 이 곧바로 배열이어도 읽는다', () => {
    const ok = { response: { header: { resultCode: '00' }, body: { item: [{ pblibNm: 'a' }] } } };
    assert.equal(itemsOf(ok).length, 1);
  });
  it('키 미신청(code 30) 은 에러', () => {
    const err = { OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: '30', errMsg: 'SERVICE_KEY_IS_NOT_REGISTERED_ERROR' } } };
    assert.equal(parseApiError(err)?.code, '30');
  });
  it('resultCode 가 정상이 아니면 에러', () => {
    const err = { response: { header: { resultCode: '22', resultMsg: 'LIMITED' } } };
    assert.equal(parseApiError(err)?.code, '22');
  });
});

describe('isClosedToday — 휴관 자연어 추정', () => {
  const mkNow = (dow: number, wom: number, min = 600): KstNow => ({
    dow,
    hour: Math.floor(min / 60),
    minute: min % 60,
    weekOfMonthForDow: wom,
    minutesOfDay: min,
  });

  it('연중무휴는 항상 안 닫음', () => {
    assert.equal(isClosedToday('연중무휴', mkNow(1, 1)), false);
  });
  it('"매주 월요일" 은 월요일이면 휴관', () => {
    assert.equal(isClosedToday('매주 월요일', mkNow(1, 3)), true); // 월
    assert.equal(isClosedToday('매주 월요일', mkNow(2, 3)), false); // 화
  });
  it('"둘째 주 화+넷째 주 화" 은 2·4째 화요일만 휴관', () => {
    const info = '둘째 주 화+넷째 주 화+공휴일';
    assert.equal(isClosedToday(info, mkNow(2, 2)), true); // 둘째주 화
    assert.equal(isClosedToday(info, mkNow(2, 4)), true); // 넷째주 화
    assert.equal(isClosedToday(info, mkNow(2, 1)), false); // 첫째주 화
    assert.equal(isClosedToday(info, mkNow(3, 2)), false); // 수
  });
  it('휴관정보 없으면 안 닫음(모르는 걸 닫힘으로 단정 안 함)', () => {
    assert.equal(isClosedToday(null, mkNow(1, 1)), false);
  });
});

describe('openStatus — 지금 여는가', () => {
  const lib: Library = normalizeLibrary(rawLib)!;
  const mkNow = (dow: number, wom: number, min: number): KstNow => ({
    dow,
    hour: Math.floor(min / 60),
    minute: min % 60,
    weekOfMonthForDow: wom,
    minutesOfDay: min,
  });

  it('평일 정오 → open', () => {
    assert.equal(openStatus(lib, mkNow(3, 1, 12 * 60)), 'open'); // 수 12:00, 09~18
  });
  it('개관 전 → before_open', () => {
    assert.equal(openStatus(lib, mkNow(3, 1, 8 * 60)), 'before_open');
  });
  it('폐관 후 → after_close', () => {
    assert.equal(openStatus(lib, mkNow(3, 1, 19 * 60)), 'after_close');
  });
  it('휴관일(넷째주 화) → closed_today', () => {
    assert.equal(openStatus(lib, mkNow(2, 4, 12 * 60)), 'closed_today');
  });
  it('운영시간 정보 없으면 unknown', () => {
    const noHours = { ...lib, hours: { weekday: { begin: null, end: null }, weekend: { begin: null, end: null }, holiday: { begin: null, end: null } } };
    assert.equal(openStatus(noHours, mkNow(3, 1, 12 * 60)), 'unknown');
  });
});

describe('libId', () => {
  it('시도+이름 합성', () => {
    assert.equal(libId('경기도 성남시', '중원도서관'), '경기도 성남시|중원도서관');
  });
});
