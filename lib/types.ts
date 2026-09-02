import type { Library, LibrarySeats } from './libraries';

/** /api/libraries 응답 — 정적 도서관 디렉터리(좌표·운영시간·휴관). 좌석 없음(TTL 분리). */
export interface LibrariesResponse {
  libraries: Library[];
  meta: {
    /** 좌표가 있어 지도에 찍는 도서관 수. */
    total: number;
    /** 좌표가 없어 지도에 못 찍어 제외한 건수(정직 노출). */
    noCoords: number;
    /** 시도별 도서관 분포(전체 기준). 커버리지 편중을 화면에 밝히기 위함. */
    byRegion: { ctpv: string; count: number }[];
  };
}

/** /api/seats 응답 — 실시간 좌석 스냅샷(도서관 id → 집계). 짧은 TTL. */
export interface SeatsResponse {
  /** 도서관 id → 좌석 집계. 여기 없는 도서관 = 실시간 미제공. */
  seats: Record<string, LibrarySeats>;
  meta: {
    /** 실시간 좌석을 제공하는 도서관 수(측정 여부 무관, 응답에 포함된 수). */
    providing: number;
    /** 그중 실제 잔여좌석이 측정된 도서관 수. */
    measured: number;
    /** 전체 최신 갱신시각(가장 최근 totDt, KST YYYYMMDDHHMMSS). */
    updatedAt: string | null;
    /** 실시간 제공 도서관의 시도별 분포. 수도권 편중을 화면에 밝히기 위함. */
    byRegion: { ctpv: string; count: number }[];
  };
}
