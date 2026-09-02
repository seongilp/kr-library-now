import { NextResponse } from 'next/server';

import { getDirectoryCached } from '@/lib/library-cache';
import { swrCacheControl } from '@/lib/cache-control';
import type { LibrariesResponse } from '@/lib/types';

/**
 * 도서관 디렉터리(정적). 전량 168곳 — 작아서 통째로 내린다(서버 공간필터 불필요).
 * 좌표·운영시간·휴관정보만. **좌석은 별도 /api/seats**(TTL 분리).
 *
 * 위치·사용자 무관 → 전 사용자 동일 → CDN 이 KST 자정까지 캐시(SWR). 콜드도 즉시 응답.
 */
export async function GET() {
  try {
    const dir = await getDirectoryCached();

    const byRegionMap = new Map<string, number>();
    for (const lib of dir.libraries) {
      const k = lib.ctpv ?? '기타';
      byRegionMap.set(k, (byRegionMap.get(k) ?? 0) + 1);
    }
    const byRegion = [...byRegionMap.entries()]
      .map(([ctpv, count]) => ({ ctpv, count }))
      .sort((a, b) => b.count - a.count);

    const body: LibrariesResponse = {
      libraries: dir.libraries,
      meta: { total: dir.libraries.length, noCoords: dir.noCoords, byRegion },
    };
    return NextResponse.json(body, {
      headers: { 'Cache-Control': swrCacheControl(3600) },
    });
  } catch (e) {
    const code = e instanceof Error && 'code' in e ? (e as { code: string }).code : 'ERROR';
    return NextResponse.json(
      { error: 'upstream', code },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
