/**
 * 카드·상세가 공유하는 상태 → 색 매핑. 한 곳에 모아 두 화면이 어긋나지 않게 한다.
 */

import type { OpenStatus } from '@/lib/libraries';
import type { SeatTone } from '@/lib/seat-status';

/** 좌석 여유 상태별 텍스트/배경 톤(배지용). none 과 full 은 색이 달라 눈으로 갈린다. */
export const SEAT_TEXT_TONE: Record<SeatTone, string> = {
  free: 'bg-emerald-500/15 text-emerald-400',
  busy: 'bg-amber-500/15 text-amber-400',
  full: 'bg-red-500/15 text-red-400',
  stale: 'bg-muted text-muted-foreground',
  none: 'bg-muted text-muted-foreground',
};

/** '지금 여는가' 배지. unknown 은 배지를 그리지 않는다(모르는 걸 아는 척하지 않음). */
export const OPEN_BADGE: Record<OpenStatus, { label: string; cls: string } | null> = {
  open: { label: '지금 열림', cls: 'bg-emerald-500/15 text-emerald-400' },
  closed_today: { label: '오늘 휴관(추정)', cls: 'bg-red-500/15 text-red-400' },
  before_open: { label: '개관 전', cls: 'bg-muted text-muted-foreground' },
  after_close: { label: '운영 종료', cls: 'bg-muted text-muted-foreground' },
  unknown: null,
};
