/**
 * 업스트림 보호 캐시(모듈 스코프 메모리 + inflight). 쿼터 방어의 핵심이다.
 *
 * ★ TTL 을 두 갈래로 분리한다(팀 지시):
 *  - **도서관 디렉터리(info_v2)**: 정적. KST 자정까지 캐시. 하루 1콜.
 *  - **좌석(rlt_rdrm)**: 실시간. SEATS_TTL_SEC(60s)만 캐시. 분 단위로 새로 받는다.
 * 목록을 좌석에 묶어 짧은 TTL 로 통째 재요청하면 정적 데이터를 낭비로 다시 받는다 —
 * 그래서 두 캐시를 따로 둔다.
 *
 * 규칙:
 *  - 성공만 캐시한다. 쿼터·타임아웃 실패는 예외로 그대로 던진다(호출부가 no-store 응답).
 *  - 인스턴스 간 공유는 library-api 의 fetch revalidate(Data Cache)가 맡고, 여기 메모리 캐시는
 *    웜 인스턴스 안에서의 추가 방어다.
 */

import { fetchLibraries, fetchRooms, SEATS_TTL_SEC } from './library-api';
import {
  aggregateSeats,
  normalizeLibrary,
  type Library,
  type LibrarySeats,
  type LibraryRaw,
  type RoomRaw,
} from './libraries';
import { msUntilKstMidnight, todayYmdKst } from './kst';

/** 정규화된 도서관 디렉터리. */
export interface Directory {
  libraries: Library[];
  /** 좌표가 없어 지도에 못 찍어 제외한 건수. */
  noCoords: number;
}

/** 원본 → 정규화 Directory. 순수 조립(테스트 가능). 좌표 없는 항목을 세어 둔다. */
export function buildDirectory(raws: LibraryRaw[]): Directory {
  const libraries: Library[] = [];
  let noCoords = 0;
  for (const r of raws) {
    const lib = normalizeLibrary(r);
    if (lib) libraries.push(lib);
    else noCoords += 1;
  }
  return { libraries, noCoords };
}

/* ── 디렉터리 캐시(KST 자정) ─────────────────────────────────── */

interface DirEntry {
  expiresAt: number;
  dir: Directory;
}
let dirCache: { key: string; entry: DirEntry } | null = null;
let dirInflight: Promise<Directory> | null = null;

export async function getDirectoryCached(): Promise<Directory> {
  const today = todayYmdKst();
  if (dirCache && dirCache.key === today && Date.now() < dirCache.entry.expiresAt) {
    return dirCache.entry.dir;
  }
  if (dirInflight) return dirInflight;

  dirInflight = fetchLibraries()
    .then((raws) => {
      const dir = buildDirectory(raws);
      dirCache = { key: today, entry: { expiresAt: Date.now() + msUntilKstMidnight(), dir } };
      return dir;
    })
    .finally(() => {
      dirInflight = null;
    });
  return dirInflight;
}

/* ── 좌석 캐시(짧은 TTL) ─────────────────────────────────────── */

interface SeatsEntry {
  expiresAt: number;
  seats: Map<string, LibrarySeats>;
}
let seatsCache: SeatsEntry | null = null;
let seatsInflight: Promise<Map<string, LibrarySeats>> | null = null;

/** 원본 열람실 행 → 좌석 집계 Map. 순수(테스트 가능). */
export function buildSeats(rooms: RoomRaw[]): Map<string, LibrarySeats> {
  return aggregateSeats(rooms);
}

export async function getSeatsCached(): Promise<Map<string, LibrarySeats>> {
  if (seatsCache && Date.now() < seatsCache.expiresAt) return seatsCache.seats;
  if (seatsInflight) return seatsInflight;

  seatsInflight = fetchRooms()
    .then((rooms) => {
      const seats = buildSeats(rooms);
      seatsCache = { expiresAt: Date.now() + SEATS_TTL_SEC * 1000, seats };
      return seats;
    })
    .finally(() => {
      seatsInflight = null;
    });
  return seatsInflight;
}
