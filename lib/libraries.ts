/**
 * 공공도서관 열람실 실시간 데이터의 정규화·조인. **순수 함수만** 둔다(테스트가 여기 붙는다).
 *
 * 데이터 출처 = 행안부 NIA "(전국 통합데이터) 공공도서관 열람실 실시간 정보"(15142580).
 * 두 오퍼레이션을 합쳐 쓴다:
 *  - info_v2         도서관 통합정보(위치·운영시간·휴관). 정적 → 긴 TTL. **좌표는 여기만 있다.**
 *  - rlt_rdrm_info_v2  열람실 실시간 좌석. 자주 바뀜 → 짧은 TTL. **좌표 없음** → info 로 조인.
 *  (prst_info_v2 는 실측상 totalCount=0 으로 비어 있어 쓰지 않는다.)
 *
 * ── 형제앱들이 피 흘려 배운 두 규칙 ──
 *  1) 응답 파서: 정상/에러 최상위 구조가 통째로 다르다. 한쪽만 기대하면 조용히 0건.
 *     정상: {header:{resultCode:"K0"/"00"...}, body:{items|item, totalCount}}
 *     키/게이트웨이 에러: OpenAPI_ServiceResponse.cmmMsgHeader.returnReasonCode(30/12/22…)
 *  2) 결측을 값인 척하지 않기: 필드가 '있는 것'과 값이 '든 것'은 다르다. 빈 값은 null 로 둔다.
 *
 * ── 이 앱 최악의 반복 결함 방지(팀 지시) ──
 *   잔여좌석 0(만석)과 "실시간 미제공"을 절대 같게 다루지 않는다. 좌석 정보가 아예 없는
 *   도서관은 seats=null(=미제공), 만석은 remain=0(=값이 든 것). 타입으로 구분을 강제한다.
 *
 * ── 조인 키(실측 확인) ──
 *   (lclgvNm, pblibNm) 이 info_v2 168곳에서 유일(중복 0). 실시간 123곳은 전부 info 에 포함.
 *   그래서 도서관 id = `${lclgvNm}|${pblibNm}`. pblibId(PLR001…)는 도서관별 로컬 순번이라 못 쓴다.
 */

import { kstNow, todayYmdKst } from './kst';

/** info_v2 item (우리가 쓰는 필드만). 이름은 실측 확인. */
export interface LibraryRaw {
  pblibNm?: string;
  stdgCd?: string;
  lclgvNm?: string; // "서울특별시 광진구"
  ctpvNm?: string; // 시도 "서울특별시"
  sggNm?: string; // 시군구 "광진구"
  pblibTypeNm?: string;
  pblibRoadNmAddr?: string;
  operInstNm?: string;
  pblibTelno?: string;
  siteUrlAddr?: string;
  lat?: string;
  lot?: string; // 경도 (오타 아님, API 필드명이 lot)
  clsrInfoExpln?: string; // 휴관정보 자연어
  wkdyOperBgngTm?: string; // HHMMSS
  wkdyOperEndTm?: string;
  wkndOperBgngTm?: string;
  wkndOperEndTm?: string;
  lhldyOperBgngTm?: string; // 공휴일
  lhldyOperEndTm?: string;
  tseatCnt?: string; // 도서관 열람석 총계(통합정보 기준, 정적)
}

/** rlt_rdrm_info_v2 item. */
export interface RoomRaw {
  lclgvNm?: string;
  pblibNm?: string;
  rdrmId?: string;
  rdrmNo?: string;
  rdrmNm?: string;
  rdrmTypeNm?: string;
  bldgFlrExpln?: string; // 층 설명
  nowVstrCnt?: string;
  tseatCnt?: string; // 총좌석수
  useSeatCnt?: string; // 사용좌석수
  rsvtSeatCnt?: string; // 예약좌석수
  rmndSeatCnt?: string; // 잔여좌석수
  totDt?: string; // 갱신시각 YYYYMMDDHHMMSS (KST)
}

/** 운영시간 한 구간(begin/end). 6자리 HHMMSS 만 신뢰, 그 외 null. */
export interface OperSpan {
  /** "0900" 4자리(HH:MM 앞). 표시·비교용. */
  begin: string | null;
  end: string | null;
}

export interface Library {
  id: string; // `${lclgvNm}|${pblibNm}`
  name: string;
  type: string | null; // pblibTypeNm
  ctpv: string | null; // 시도
  sgg: string | null; // 시군구
  region: string | null; // lclgvNm 전체
  addr: string | null;
  lat: number;
  lon: number;
  tel: string | null;
  siteUrl: string | null;
  closedInfo: string | null; // 휴관정보 원문(자연어)
  hours: {
    weekday: OperSpan;
    weekend: OperSpan;
    holiday: OperSpan;
  };
  /** 통합정보 기준 열람석 총계(정적). 실시간 좌석과 다를 수 있어 참고용. */
  seatTotalDir: number | null;
}

/** 한 열람실의 실시간 좌석. remain=0 은 '만석'(값), null 은 '미측정'(결측) — 구분한다. */
export interface SeatRoom {
  id: string;
  name: string;
  floor: string | null;
  total: number | null;
  used: number | null;
  reserved: number | null;
  remain: number | null;
}

/** 한 도서관의 실시간 좌석 집계. 이 객체가 있으면 '실시간 제공', null 이면 '미제공'. */
export interface LibrarySeats {
  rooms: SeatRoom[];
  /** 총좌석 합(측정된 방만). */
  totalSeats: number;
  /** 잔여좌석 합(측정된 방만). */
  totalRemain: number;
  /** 측정된 방 수 / 전체 방 수 — 일부 방만 값이 올 때 정직하게. */
  measuredRooms: number;
  /** 최신 갱신시각 원문 YYYYMMDDHHMMSS(KST). */
  updatedAt: string | null;
  /** 갱신시각이 오늘(KST)이 아니면 stale — 연계가 끊긴 도서관. */
  stale: boolean;
}

/** 클라이언트로 내보내는 도서관(+거리 +좌석). seats=null 은 실시간 미제공. */
export interface LibraryWithSeats extends Library {
  distanceKm: number;
  seats: LibrarySeats | null;
}

// 한국 대략 경계(WGS84). 좌표 스왑·0,0 쓰레기를 거른다.
const KR_LON = [124, 132] as const;
const KR_LAT = [33, 39] as const;

const numOrNull = (v: string | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const trimOrNull = (v: string | undefined): string | null => v?.trim() || null;

/** 도서관 식별 id. 조인·라우팅에 쓰는 안정 키. */
export function libId(lclgvNm: string | undefined, pblibNm: string | undefined): string {
  return `${(lclgvNm ?? '').trim()}|${(pblibNm ?? '').trim()}`;
}

/** HHMMSS 문자열 → "HHMM"(앞 4자리). 6자리 숫자가 아니면 null(결측·비정형 방어). */
export function parseHhmmss(v: string | undefined): string | null {
  const s = v?.trim();
  if (!s || !/^\d{6}$/.test(s)) return null;
  const hh = s.slice(0, 2);
  const mm = s.slice(2, 4);
  if (Number(hh) > 23 || Number(mm) > 59) return null;
  return hh + mm;
}

/** "HHMM" → "HH:MM" 표시용. null 이면 null. */
export function fmtHm(hhmm: string | null): string | null {
  return hhmm ? `${hhmm.slice(0, 2)}:${hhmm.slice(2, 4)}` : null;
}

/**
 * info_v2 원본 → 정규화 Library. 좌표가 없거나 한국 밖이면 null(지도에 못 찍는다).
 * 결측 필드는 비운 채로 둔다 — 절대 지어내지 않는다.
 */
export function normalizeLibrary(raw: LibraryRaw): Library | null {
  const name = raw.pblibNm?.trim();
  const lat = numOrNull(raw.lat);
  const lon = numOrNull(raw.lot);
  if (!name) return null;
  if (lat == null || lon == null) return null;
  if (lon < KR_LON[0] || lon > KR_LON[1] || lat < KR_LAT[0] || lat > KR_LAT[1]) return null;

  return {
    id: libId(raw.lclgvNm, raw.pblibNm),
    name,
    type: trimOrNull(raw.pblibTypeNm),
    ctpv: trimOrNull(raw.ctpvNm),
    sgg: trimOrNull(raw.sggNm),
    region: trimOrNull(raw.lclgvNm),
    addr: trimOrNull(raw.pblibRoadNmAddr),
    lat,
    lon,
    tel: trimOrNull(raw.pblibTelno),
    siteUrl: trimOrNull(raw.siteUrlAddr),
    closedInfo: trimOrNull(raw.clsrInfoExpln),
    hours: {
      weekday: { begin: parseHhmmss(raw.wkdyOperBgngTm), end: parseHhmmss(raw.wkdyOperEndTm) },
      weekend: { begin: parseHhmmss(raw.wkndOperBgngTm), end: parseHhmmss(raw.wkndOperEndTm) },
      holiday: { begin: parseHhmmss(raw.lhldyOperBgngTm), end: parseHhmmss(raw.lhldyOperEndTm) },
    },
    seatTotalDir: numOrNull(raw.tseatCnt),
  };
}

/** 열람실 한 행 → SeatRoom. 좌석 수치는 숫자 또는 null(결측). */
export function normalizeRoom(raw: RoomRaw): SeatRoom {
  return {
    id: raw.rdrmId?.trim() || raw.rdrmNo?.trim() || raw.rdrmNm?.trim() || 'room',
    name: raw.rdrmNm?.trim() || '열람실',
    floor: trimOrNull(raw.bldgFlrExpln),
    total: numOrNull(raw.tseatCnt),
    used: numOrNull(raw.useSeatCnt),
    reserved: numOrNull(raw.rsvtSeatCnt),
    remain: numOrNull(raw.rmndSeatCnt),
  };
}

/**
 * 열람실 행들을 도서관 id 별로 묶어 좌석 집계 Map 을 만든다.
 * 합계는 '측정된(값이 든) 방'만 더한다 — 결측을 0 으로 세지 않는다(정직성).
 */
export function aggregateSeats(rooms: RoomRaw[], nowMs: number = Date.now()): Map<string, LibrarySeats> {
  const byLib = new Map<string, RoomRaw[]>();
  for (const r of rooms) {
    const id = libId(r.lclgvNm, r.pblibNm);
    const arr = byLib.get(id);
    if (arr) arr.push(r);
    else byLib.set(id, [r]);
  }

  const today = todayYmdKst(nowMs);
  const out = new Map<string, LibrarySeats>();
  for (const [id, raws] of byLib) {
    const parsed = raws.map(normalizeRoom);
    let totalSeats = 0;
    let totalRemain = 0;
    let measuredRooms = 0;
    let updatedAt: string | null = null;
    for (const room of parsed) {
      if (room.remain != null) {
        measuredRooms += 1;
        totalRemain += room.remain;
        if (room.total != null) totalSeats += room.total;
      }
    }
    for (const r of raws) {
      const dt = r.totDt?.trim();
      if (dt && (!updatedAt || dt > updatedAt)) updatedAt = dt;
    }
    const stale = !updatedAt || updatedAt.slice(0, 8) !== today;
    out.set(id, {
      rooms: parsed,
      totalSeats,
      totalRemain,
      measuredRooms,
      updatedAt,
      stale,
    });
  }
  return out;
}

/** 도서관 목록 + 좌석 Map → 조인. 좌석이 없으면 seats=null(실시간 미제공). */
export function joinSeats(
  libraries: Library[],
  seats: Map<string, LibrarySeats>,
): Array<Library & { seats: LibrarySeats | null }> {
  return libraries.map((lib) => ({ ...lib, seats: seats.get(lib.id) ?? null }));
}

/* ── 응답 파서(세 구조 모두 본다) ─────────────────────────────── */

/** 정상 응답 body.items|item 배열을 안전하게 뽑는다. */
export function itemsOf<T>(json: unknown): T[] {
  const body = (json as { response?: { body?: unknown }; body?: unknown })?.response?.body
    ?? (json as { body?: unknown })?.body;
  const items = (body as { items?: unknown; item?: unknown })?.items ?? (body as { item?: unknown })?.item;
  // items 가 {item:[...]} 형태거나 곧바로 배열/단일객체인 경우 모두 대응.
  const inner = (items as { item?: unknown })?.item ?? items;
  if (Array.isArray(inner)) return inner as T[];
  return inner ? [inner as T] : [];
}

/** 정상 응답 totalCount(없으면 0). */
export function totalOf(json: unknown): number {
  const body = (json as { response?: { body?: unknown }; body?: unknown })?.response?.body
    ?? (json as { body?: unknown })?.body;
  return (body as { totalCount?: number })?.totalCount ?? 0;
}

/**
 * 응답이 에러면 { code, msg }, 정상이면 null.
 *  - OpenAPI_ServiceResponse.cmmMsgHeader (키/쿼터 계열). 30=미신청, 12=서비스없음, 22=쿼터.
 *  - header.resultCode: 정상은 "00" 또는 "K0"(NORMAL_SERVICE). 그 외는 에러.
 * 200 이 성공이 아니다 — 본문 코드로 판정한다.
 */
const OK_CODES = new Set(['00', '0000', 'K0', 'NORMAL_SERVICE', 'NORMALSERVICE', 'INFO-0']);

export function parseApiError(json: unknown): { code: string; msg: string } | null {
  const cmm = (
    json as {
      OpenAPI_ServiceResponse?: { cmmMsgHeader?: { returnReasonCode?: string; errMsg?: string } };
    }
  )?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (cmm?.returnReasonCode) {
    return { code: cmm.returnReasonCode, msg: cmm.errMsg ?? 'service error' };
  }

  const header = (
    json as { response?: { header?: { resultCode?: string; resultMsg?: string } } }
  )?.response?.header
    ?? (json as { header?: { resultCode?: string; resultMsg?: string } })?.header;

  if (header?.resultCode != null) {
    const code = String(header.resultCode).trim();
    if (!OK_CODES.has(code)) {
      return { code, msg: header.resultMsg ?? 'service error' };
    }
  }
  return null;
}

/* ── "지금 여는가" 판정 ────────────────────────────────────────── */

export type OpenStatus =
  | 'open' // 지금 운영 중
  | 'closed_today' // 오늘 휴관(휴관일 규칙에 걸림)
  | 'before_open' // 오늘 열지만 아직 개관 전
  | 'after_close' // 오늘 열지만 이미 폐관
  | 'unknown'; // 운영시간 정보가 없어 판정 불가

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];
const ORDINAL_KO: Record<string, number> = {
  첫째: 1,
  둘째: 2,
  셋째: 3,
  넷째: 4,
  다섯째: 5,
  첫: 1,
  둘: 2,
  셋: 3,
  넷: 4,
};

/**
 * 휴관정보 자연어로 '오늘 휴관인가'를 추정한다. 자연어라 완벽하진 않다 — 화면에서
 * "휴관일 정보 기준 추정"으로 정직하게 라벨링한다.
 *
 * 대응 패턴(실측 표본):
 *  - "연중무휴" → 휴관 아님
 *  - "매주 월요일", "매주 월" → 그 요일이면 휴관
 *  - "첫째·셋째 월요일", "둘째, 넷째 월요일", "매월 둘째주 월요일" → 월중 몇째주 그 요일이면 휴관
 *  - "법정공휴일"/"공휴일" → 공휴일 캘린더가 없어 판정 못 함(무시). 화면 원문으로 안내.
 */
export function isClosedToday(closedInfo: string | null, now = kstNow()): boolean {
  if (!closedInfo) return false;
  const text = closedInfo.replace(/\s+/g, '');
  if (text.includes('연중무휴')) return false;

  const todayDow = now.dow; // 0=일
  const todayOrdinal = now.weekOfMonthForDow;

  // "매주 X요일" — 요일 문자를 찾되, 앞에 서수(첫째 등)가 없을 때만 매주로 본다.
  // 구현을 단순화: 세그먼트(+ , 및 · / 로 분리) 단위로 훑는다.
  const segments = closedInfo.split(/[+,·/]|및/).map((s) => s.replace(/\s+/g, ''));

  for (const seg of segments) {
    if (!seg) continue;
    // 이 세그먼트가 가리키는 요일(들)
    const dows: number[] = [];
    for (let d = 0; d < 7; d += 1) {
      if (seg.includes(DOW_KO[d] + '요일') || new RegExp(`(주|째)${DOW_KO[d]}(?!요)`).test(seg)) {
        dows.push(d);
      }
    }
    if (dows.length === 0) continue;
    if (!dows.includes(todayDow)) continue;

    // 이 세그먼트에 서수(첫째~다섯째)가 있으면 그 주차에만 휴관. 없으면 매주 휴관.
    const ordinals: number[] = [];
    for (const key of Object.keys(ORDINAL_KO)) {
      if (seg.includes(key)) ordinals.push(ORDINAL_KO[key]);
    }
    if (ordinals.length === 0) {
      if (seg.includes('매주') || !/\d|첫|둘|셋|넷|다섯/.test(seg)) return true;
      // 서수 표현이 애매하면 보수적으로 매주로 보지 않고 넘어간다.
      return true;
    }
    if (ordinals.includes(todayOrdinal)) return true;
  }
  return false;
}

/** 오늘 적용되는 운영시간 구간(평일/주말/공휴일 중). 공휴일은 캘린더가 없어 주말과 동일 취급 안 함. */
export function todaySpan(lib: Library, now = kstNow()): OperSpan {
  // 0=일,6=토 → 주말. 평일은 그 외. (공휴일 캘린더가 없어 공휴일 구간은 못 고른다.)
  if (now.dow === 0 || now.dow === 6) {
    // 주말 값이 없으면 평일 값으로 폴백하지 않는다(주말 휴관일 수 있으므로 unknown 이 정직).
    return lib.hours.weekend;
  }
  return lib.hours.weekday;
}

/** '지금 여는가' 종합 판정. */
export function openStatus(lib: Library, now = kstNow()): OpenStatus {
  if (isClosedToday(lib.closedInfo, now)) return 'closed_today';
  const span = todaySpan(lib, now);
  if (!span.begin || !span.end) return 'unknown';
  const b = Number(span.begin.slice(0, 2)) * 60 + Number(span.begin.slice(2, 4));
  const e = Number(span.end.slice(0, 2)) * 60 + Number(span.end.slice(2, 4));
  const t = now.minutesOfDay;
  if (t < b) return 'before_open';
  if (t >= e) return 'after_close';
  return 'open';
}
