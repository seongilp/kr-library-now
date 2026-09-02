'use client';

import { Armchair, Clock, MapPin } from 'lucide-react';

import type { LibraryWithSeats, OpenStatus } from '@/lib/libraries';
import { seatTone, type SeatTone } from '@/lib/seat-status';
import { cn } from '@/lib/utils';
import { OPEN_BADGE, SEAT_TEXT_TONE } from '@/components/status-styles';

/**
 * 도서관 카드. 이름 + 지역 + 거리 + (지금 여는가 배지) + 실시간 좌석 요약.
 *
 * 좌석 요약은 값과 결측을 분명히 가른다:
 *  - 실시간 제공: "잔여 N석" (색으로 여유/혼잡/만석)
 *  - 만석: "만석" (빨강) — 0석이지만 값이 든 것
 *  - 미제공/갱신 안 됨: "실시간 미제공" (회색) — 값이 없는 것
 */
export function LibraryCard({
  lib,
  status,
  usedFallback,
  selected,
  onSelect,
}: {
  lib: LibraryWithSeats;
  status: OpenStatus;
  usedFallback: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const tone = seatTone(lib.seats);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'flex w-full flex-col gap-1.5 rounded-xl border p-3 text-left transition-colors',
        selected
          ? 'border-primary bg-primary/10'
          : 'border-border bg-card hover:border-primary/40 hover:bg-accent',
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate text-sm font-semibold">{lib.name}</h3>
        {!usedFallback && (
          <span className="shrink-0 text-xs font-medium text-primary">{lib.distanceKm}km</span>
        )}
      </div>

      {lib.region && (
        <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
          <MapPin className="size-3 shrink-0" />
          {lib.region}
          {lib.type && <span className="opacity-60"> · {lib.type}</span>}
        </p>
      )}

      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
        {/* 좌석 요약 */}
        <SeatBadge tone={tone} lib={lib} />
        {/* 지금 여는가 */}
        <OpenBadge status={status} />
      </div>
    </button>
  );
}

function SeatBadge({ tone, lib }: { tone: SeatTone; lib: LibraryWithSeats }) {
  const s = lib.seats;
  const label =
    tone === 'none'
      ? '실시간 미제공'
      : tone === 'stale'
        ? '갱신 안 됨'
        : tone === 'full'
          ? '만석'
          : `잔여 ${s!.totalRemain.toLocaleString()}석`;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        SEAT_TEXT_TONE[tone],
      )}
    >
      <Armchair className="size-3" />
      {label}
      {(tone === 'free' || tone === 'busy') && s!.totalSeats > 0 && (
        <span className="opacity-60">/{s!.totalSeats.toLocaleString()}</span>
      )}
    </span>
  );
}

function OpenBadge({ status }: { status: OpenStatus }) {
  const cfg = OPEN_BADGE[status];
  if (!cfg) return null;
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', cfg.cls)}>
      <Clock className="size-3" />
      {cfg.label}
    </span>
  );
}
