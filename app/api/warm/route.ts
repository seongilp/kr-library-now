import { NextResponse } from 'next/server';

/**
 * 카탈로그 예열(cron). 첫 사용자가 콜드 수집을 안 밟도록 미리 데운다.
 *
 * 공개 URL 로 /api/libraries 와 /api/seats 를 때려 Data Cache + CDN 을 함께 채운다.
 * 서버에서 캐시 함수만 부르면 CDN 은 안 채워지므로 반드시 공개 도메인으로 요청한다.
 *
 * Vercel Hobby 크론은 하루 1회. KST 자정 직후(UTC 15:00)로 잡아 디렉터리 SWR 이 자정에 만료된 뒤
 * 그날 첫 요청을 예열이 커버하게 한다. (좌석은 TTL 60s 라 예열로 오래 못 데우지만, 디렉터리
 * 예열만으로도 콜드 첫 요청의 무거운 부분은 사라진다.)
 *
 * fail closed: CRON_SECRET 없으면 503, 안 맞으면 401.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function baseUrl(): string {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? 'kr-library-now.vercel.app';
  return `https://${host}`;
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: 'CRON_SECRET 이 설정되지 않았습니다 (fail closed).' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json(
      { error: '인증 실패' },
      { status: 401, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const started = Date.now();
  try {
    const opts = {
      cache: 'no-store' as const,
      signal: AbortSignal.timeout(45_000),
      headers: { Accept: 'application/json' },
    };
    const [libRes, seatRes] = await Promise.all([
      fetch(`${baseUrl()}/api/libraries`, opts),
      fetch(`${baseUrl()}/api/seats`, opts),
    ]);
    const ms = Date.now() - started;
    if (!libRes.ok || !seatRes.ok) {
      return NextResponse.json(
        { ok: false, libraries: libRes.status, seats: seatRes.status, ms },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }
    const lib = (await libRes.json()) as { meta?: { total?: number } };
    const seat = (await seatRes.json()) as { meta?: { providing?: number; measured?: number } };
    return NextResponse.json(
      {
        ok: true,
        warmedAt: new Date().toISOString(),
        ms,
        total: lib.meta?.total ?? 0,
        providing: seat.meta?.providing ?? 0,
        measured: seat.meta?.measured ?? 0,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { ok: false, error: message, ms: Date.now() - started },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
