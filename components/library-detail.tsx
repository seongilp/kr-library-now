'use client';

import { Armchair, Clock, ExternalLink, MapPin, Phone, TriangleAlert, X } from 'lucide-react';

import type { LibraryWithSeats, OpenStatus } from '@/lib/libraries';
import { fmtHm } from '@/lib/libraries';
import { seatTone } from '@/lib/seat-status';
import { cn } from '@/lib/utils';
import { OPEN_BADGE, SEAT_TEXT_TONE } from '@/components/status-styles';

/**
 * 도서관 상세 시트. 도서관을 1급 엔티티로 보여 준다 — 좌석은 그 도서관의 실시간 속성이다.
 * (미래: 정보나루 활성화 시 "이 책 어느 도서관에" 소장 정보가 같은 시트 아래에 붙는다.)
 *
 * 좌석 표시는 값과 결측을 분명히 가른다. 미제공 도서관은 그 사실을 문장으로 밝히고,
 * stale(갱신 끊김)은 경고와 함께 마지막 갱신 시각을 보여 준다 — '실시간'을 이름뿐으로 두지 않기.
 */
export function LibraryDetail({
  lib,
  status,
  usedFallback,
  onClose,
}: {
  lib: LibraryWithSeats;
  status: OpenStatus;
  usedFallback: boolean;
  onClose: () => void;
}) {
  const tone = seatTone(lib.seats);
  const openCfg = OPEN_BADGE[status];

  return (
    <div className="max-h-[80dvh] overflow-y-auto rounded-t-2xl border border-border bg-card shadow-2xl sm:max-h-[75dvh] sm:rounded-2xl">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 flex items-start justify-between gap-2 border-b border-border bg-card/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold">{lib.name}</h2>
          {lib.region && (
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" />
              {lib.region}
              {lib.type && <span className="opacity-70"> · {lib.type}</span>}
              {!usedFallback && <span className="text-primary"> · {lib.distanceKm}km</span>}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-5" />
        </button>
      </div>

      <div className="space-y-4 px-4 py-4">
        {/* 실시간 좌석 — 이 앱의 핵심 */}
        <section className="rounded-xl border border-border bg-background/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <Armchair className="size-3.5" />
              실시간 열람실 좌석
            </span>
            {lib.seats?.updatedAt && (
              <span className="text-[11px] text-muted-foreground">{fmtTotDt(lib.seats.updatedAt)} 기준</span>
            )}
          </div>

          {lib.seats == null || tone === 'none' ? (
            <p className="py-2 text-xs text-muted-foreground">
              이 도서관은 실시간 좌석 정보를 제공하지 않습니다. (운영시간·위치 정보만 제공)
            </p>
          ) : (
            <>
              {lib.seats.stale && (
                <p className="mb-2 flex items-start gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-300">
                  <TriangleAlert className="mt-0.5 size-3 shrink-0" />
                  최근 갱신이 오래돼 실제와 다를 수 있습니다(연계 지연).
                </p>
              )}
              <div className="mb-2 flex items-baseline gap-2">
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-sm font-bold',
                    SEAT_TEXT_TONE[tone],
                  )}
                >
                  {tone === 'full' ? '만석' : `잔여 ${lib.seats.totalRemain.toLocaleString()}석`}
                </span>
                {lib.seats.totalSeats > 0 && (
                  <span className="text-xs text-muted-foreground">
                    총 {lib.seats.totalSeats.toLocaleString()}석
                  </span>
                )}
              </div>
              {/* 열람실별 */}
              <ul className="divide-y divide-border/60">
                {lib.seats.rooms.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-2 py-1.5 text-xs">
                    <span className="min-w-0 truncate">
                      {r.name}
                      {r.floor && <span className="text-muted-foreground"> · {r.floor}</span>}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {r.remain == null ? (
                        <span className="text-muted-foreground">정보 없음</span>
                      ) : (
                        <>
                          <span
                            className={
                              r.remain <= 0
                                ? 'font-semibold text-red-400'
                                : 'font-semibold text-emerald-400'
                            }
                          >
                            {r.remain <= 0 ? '만석' : `${r.remain}석`}
                          </span>
                          {r.total != null && (
                            <span className="text-muted-foreground"> / {r.total}</span>
                          )}
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        {/* 운영시간 · 휴관 */}
        <section className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <Clock className="size-3.5" />
            운영시간
            {openCfg && (
              <span className={cn('ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium', openCfg.cls)}>
                {openCfg.label}
              </span>
            )}
          </div>
          <HoursRow label="평일" span={lib.hours.weekday} />
          <HoursRow label="주말" span={lib.hours.weekend} />
          <HoursRow label="공휴일" span={lib.hours.holiday} />
          {lib.closedInfo && (
            <p className="pt-1 text-xs text-muted-foreground">
              <span className="mr-1.5 font-medium">휴관</span>
              {lib.closedInfo}
              <span className="ml-1 opacity-60">(휴관일 기준 추정)</span>
            </p>
          )}
        </section>

        {/* 주소 */}
        {lib.addr && (
          <Row icon={<MapPin className="size-4" />} label="주소">
            {lib.addr}
          </Row>
        )}

        {/* 전화 */}
        {lib.tel && (
          <Row icon={<Phone className="size-4" />} label="전화">
            <a href={`tel:${lib.tel}`} className="text-primary hover:underline">
              {lib.tel}
            </a>
          </Row>
        )}

        {/* 링크 */}
        <div className="flex flex-wrap gap-2 pt-1">
          {lib.siteUrl && <LinkBtn href={lib.siteUrl}>홈페이지</LinkBtn>}
          <LinkBtn
            href={`https://map.kakao.com/link/to/${encodeURIComponent(lib.name)},${lib.lat},${lib.lon}`}
          >
            길찾기
          </LinkBtn>
        </div>

        {/*
          미래 확장 자리: 정보나루(data4library.kr)가 활성화되면 여기에 "이 도서관 소장 도서 검색"
          또는 "찾는 책이 있는 도서관" 결과가 붙는다. 도서관이 1급 엔티티라 구조 변경 없이 얹힌다.
        */}
      </div>
    </div>
  );
}

function HoursRow({ label, span }: { label: string; span: { begin: string | null; end: string | null } }) {
  const b = fmtHm(span.begin);
  const e = fmtHm(span.end);
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="w-10 shrink-0 text-muted-foreground">{label}</span>
      <span className={b && e ? '' : 'text-muted-foreground'}>{b && e ? `${b} ~ ${e}` : '정보 없음'}</span>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="min-w-0">
        <span className="mr-2 text-xs font-medium text-muted-foreground">{label}</span>
        <span className="break-words">{children}</span>
      </div>
    </div>
  );
}

function LinkBtn({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
    >
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}

/** YYYYMMDDHHMMSS → "HH:MM"(KST 문자열 그대로 자름). 값이 이상하면 원문 앞부분. */
function fmtTotDt(v: string): string {
  if (/^\d{12,14}$/.test(v)) return `${v.slice(8, 10)}:${v.slice(10, 12)}`;
  return v.slice(0, 12);
}
