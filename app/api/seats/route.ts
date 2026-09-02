import { NextResponse } from 'next/server';

import { getDirectoryCached, getSeatsCached } from '@/lib/library-cache';
import { SEATS_TTL_SEC } from '@/lib/library-api';
import type { SeatsResponse } from '@/lib/types';
import type { LibrarySeats } from '@/lib/libraries';

/**
 * 실시간 좌석 스냅샷. 도서관 id → 좌석 집계. **짧은 TTL**(좌석은 분 단위로 바뀐다).
 *
 * 위치·사용자 무관(전국 동일)이라 CDN 이 캐시하되, s-maxage 를 SEATS_TTL_SEC 로 짧게 잡아
 * 실시간성을 지킨다. 여기 없는 도서관 = 실시간 미제공(클라이언트가 '미제공'으로 구분).
 *
 * 시도별 분포(byRegion)는 디렉터리에서 ctpv 를 붙여 계산 — "실시간 제공이 어느 지역에 몰렸나"를
 * 화면에 정직하게 밝히기 위함(수도권 85% 편중).
 */
export async function GET() {
  try {
    const [dir, seatsMap] = await Promise.all([getDirectoryCached(), getSeatsCached()]);

    const seats: Record<string, LibrarySeats> = {};
    let measured = 0;
    const byRegionMap = new Map<string, number>();
    const ctpvOf = new Map(dir.libraries.map((l) => [l.id, l.ctpv ?? '기타']));

    let latest: string | null = null;
    for (const [id, s] of seatsMap) {
      seats[id] = s;
      if (s.measuredRooms > 0) measured += 1;
      const ctpv = ctpvOf.get(id) ?? '기타';
      byRegionMap.set(ctpv, (byRegionMap.get(ctpv) ?? 0) + 1);
      if (s.updatedAt && (!latest || s.updatedAt > latest)) latest = s.updatedAt;
    }
    const byRegion = [...byRegionMap.entries()]
      .map(([ctpv, count]) => ({ ctpv, count }))
      .sort((a, b) => b.count - a.count);

    const body: SeatsResponse = {
      seats,
      meta: { providing: seatsMap.size, measured, updatedAt: latest, byRegion },
    };
    return NextResponse.json(body, {
      headers: {
        'Cache-Control': `public, s-maxage=${SEATS_TTL_SEC}, stale-while-revalidate=${SEATS_TTL_SEC}`,
      },
    });
  } catch (e) {
    const code = e instanceof Error && 'code' in e ? (e as { code: string }).code : 'ERROR';
    return NextResponse.json(
      { error: 'upstream', code },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
