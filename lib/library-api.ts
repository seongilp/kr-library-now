/**
 * 공공도서관 열람실 실시간 API 클라이언트. **서버 전용.** (15142580, 행안부 NIA)
 *
 * ── 키 인코딩 함정(형제앱들이 반복해 데인 것) ──
 * DATA_GO_KR_KEY(=HORSE) 는 이미 %-인코딩된 Encoding 키다. 쿼리스트링을 **문자열로 직접 조립**하고
 * serviceKey 는 verbatim 으로 이어붙인다. URLSearchParams 에 넣으면 재인코딩되어(`%2B`→`%252B`)
 * code 30 SERVICE_KEY_IS_NOT_REGISTERED 가 난다 — "미신청"과 문자열이 똑같아 오진한다.
 * 키 값은 절대 로그로 출력하지 않는다.
 *
 * ── 사양(신청 후 직접 호출로 확인, 2026-09-02) ──
 *  base: apis.data.go.kr/B551982/plr_v2
 *  - info_v2         totalCount=168. numOfRows=500 이면 1콜에 전량. 좌표 lat/lot WGS84 100%.
 *  - rlt_rdrm_info_v2 totalCount=270(열람실), 123개 도서관. totDt 가 분 단위로 갱신되는 진짜 실시간.
 *  정상 헤더 resultCode="K0"(NORMAL_SERVICE). 오퍼당 신청량 5,000/일.
 *
 * ── 실패 처리 ──
 * 200 이 성공이 아니다. 본문 코드로 판정(parseApiError). 실패는 예외로 던지고 **캐시하지 않는다**.
 * 모든 fetch 에 AbortSignal.timeout.
 */

import { itemsOf, parseApiError, type LibraryRaw, type RoomRaw } from './libraries';
import { secondsUntilKstMidnight } from './kst';

const HOST = 'https://apis.data.go.kr/B551982/plr_v2';
const TIMEOUT_MS = 8000;
const COMMON = 'type=json';

/** 좌석 실시간 TTL(초). 좌석은 분 단위로 바뀌므로 짧게. 60s → 업스트림 최대 1,440콜/일(한도 5,000의 29%). */
export const SEATS_TTL_SEC = 60;

export class LibraryApiFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'LibraryApiFailure';
  }
}

function serviceKey(): string {
  const key = process.env.DATA_GO_KR_KEY?.trim() || process.env.HORSE?.trim();
  if (!key) throw new LibraryApiFailure('NO_KEY', 'DATA_GO_KR_KEY 가 설정되지 않았습니다.');
  // 이미 %-인코딩된 Encoding 키면 그대로, Decoding 키(% 없음)만 한 번 인코딩한다.
  return key.includes('%') ? key : encodeURIComponent(key);
}

/**
 * @param revalidate Next Data Cache TTL(초). **인스턴스 간 공유 캐시**라 콜드 인스턴스가
 *   업스트림을 다시 때리지 않는다. 0 이면 no-store.
 */
async function fetchJson(url: string, revalidate: number): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    next: revalidate > 0 ? { revalidate } : undefined,
    ...(revalidate > 0 ? {} : { cache: 'no-store' as const }),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // 인증/게이트웨이 오류는 _type=json 을 줘도 XML 로 떨어진다. 코드만 뽑아 실패로.
    const code = /<returnReasonCode>([^<]*)</.exec(text)?.[1] ?? 'NON_JSON';
    throw new LibraryApiFailure(code, `응답 해석 실패: ${text.slice(0, 120)}`);
  }
  const err = parseApiError(json);
  if (err) throw new LibraryApiFailure(err.code, err.msg);
  return json;
}

/** 도서관 통합정보(info_v2) 전량. 정적이라 KST 자정까지 공유 Data Cache. */
export async function fetchLibraries(): Promise<LibraryRaw[]> {
  const url = `${HOST}/info_v2?serviceKey=${serviceKey()}&${COMMON}&pageNo=1&numOfRows=500`;
  const json = await fetchJson(url, secondsUntilKstMidnight());
  return itemsOf<LibraryRaw>(json);
}

/** 열람실 실시간 좌석(rlt_rdrm_info_v2) 전량. 짧은 TTL(SEATS_TTL_SEC). */
export async function fetchRooms(): Promise<RoomRaw[]> {
  const url = `${HOST}/rlt_rdrm_info_v2?serviceKey=${serviceKey()}&${COMMON}&pageNo=1&numOfRows=1000`;
  const json = await fetchJson(url, SEATS_TTL_SEC);
  return itemsOf<RoomRaw>(json);
}
