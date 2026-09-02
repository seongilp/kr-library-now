/**
 * KST 달력 날짜·시각 계산. (형제앱 kr-camping-now/lib/kst.ts 를 물려받고, "지금 여는가"
 * 판정에 필요한 요일·시·분·월중 몇째주 헬퍼를 더했다.)
 *
 * 왜 따로 두는가: 캐시 TTL 을 "KST 자정"에서 잘라야 날짜 경계를 넘겨 하루 틀린 캐시를
 * 재사용하는 일이 구조적으로 안 생긴다. 서버는 UTC 로 도므로 KST 보정을 여기 한 곳에 모은다.
 */

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** 지금이 KST 로 며칠인지, 1970-01-01 을 0 으로 세는 정수. */
export function kstToday(nowMs: number = Date.now()): number {
  return Math.floor((nowMs + KST_OFFSET_MS) / DAY_MS);
}

/** 에폭 일수 → `20260901`. */
export function dayToYmd(day: number): string {
  const date = new Date(day * DAY_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

/** KST 기준 오늘 `YYYYMMDD`. */
export function todayYmdKst(nowMs: number = Date.now()): string {
  return dayToYmd(kstToday(nowMs));
}

/** 다음 KST 자정까지 남은 밀리초. 자정 정각이면 꼬박 하루. */
export function msUntilKstMidnight(nowMs: number = Date.now()): number {
  return (kstToday(nowMs) + 1) * DAY_MS - KST_OFFSET_MS - nowMs;
}

/** 다음 KST 자정까지 남은 '초'. 항상 1 이상. CDN/Data Cache TTL 계산용. */
export function secondsUntilKstMidnight(nowMs: number = Date.now()): number {
  return Math.max(1, Math.ceil(msUntilKstMidnight(nowMs) / 1000));
}

/** KST 벽시계 조각. "지금 여는가" 판정과 stale 표시에 쓴다. */
export interface KstNow {
  /** 요일: 0=일 … 6=토 (KST 기준). */
  dow: number;
  /** 0~23 시(KST). */
  hour: number;
  /** 0~59 분(KST). */
  minute: number;
  /** 이 달에서 같은 요일의 몇 번째인가(1~5). "둘째 주 월요일" 판정용. */
  weekOfMonthForDow: number;
  /** 자정 이후 분(0~1439). 운영시간 비교용. */
  minutesOfDay: number;
}

/**
 * KST 현재 시각 조각. UTC epoch 에 9시간을 더해 UTC 게터로 읽으면 KST 달력값이 된다.
 * (Date 의 로컬 타임존에 의존하지 않으려는 형제앱의 관례.)
 */
export function kstNow(nowMs: number = Date.now()): KstNow {
  const d = new Date(nowMs + KST_OFFSET_MS);
  const dom = d.getUTCDate();
  return {
    dow: d.getUTCDay(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    weekOfMonthForDow: Math.floor((dom - 1) / 7) + 1,
    minutesOfDay: d.getUTCHours() * 60 + d.getUTCMinutes(),
  };
}
