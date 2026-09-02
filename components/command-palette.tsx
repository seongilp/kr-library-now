'use client';

import { Command } from 'cmdk';
import { useEffect, useMemo, useState } from 'react';
import { Armchair, BookOpen, Clock, Loader2, MapPin, Search } from 'lucide-react';

import type { Library } from '@/lib/libraries';
import type { LibFilters } from '@/lib/lib-filters';

/**
 * 커맨드 팔레트(⌘K / Ctrl+K). shadcn 이 쓰는 것과 같은 `cmdk` 를 그대로 쓴다.
 * 감싸는 모달 오버레이만 직접 그린다(cmdk 의 Command.Dialog 는 Radix 의존 → base-ui 계열과 충돌 회피).
 *
 * 하는 일:
 *  1) 도서관 이름·지역 검색(전국 목록은 클라이언트에 이미 있으므로 서버를 안 때린다).
 *  2) 필터 토글(실시간만·지금 자리·지금 열림) + 시도 선택.
 */
const MAX_RESULTS = 40;

export function CommandPalette({
  open,
  onClose,
  libraries,
  loading,
  filters,
  setFilters,
  regions,
  onSelectLibrary,
}: {
  open: boolean;
  onClose: () => void;
  libraries: Library[] | null;
  loading: boolean;
  filters: LibFilters;
  setFilters: (updater: (f: LibFilters) => LibFilters) => void;
  regions: { ctpv: string; count: number }[];
  onSelectLibrary: (id: string) => void;
}) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    // 팔레트가 열릴 때(외부 prop)마다 직전 검색어를 비운다 — 외부 상태와의 동기화라 의도된 setState.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setQuery('');
  }, [open]);

  const q = query.trim().toLowerCase();
  const results = useMemo(() => {
    if (!libraries || !q) return [];
    const hits: Library[] = [];
    for (const c of libraries) {
      if (c.name.toLowerCase().includes(q) || (c.region ?? '').toLowerCase().includes(q)) {
        hits.push(c);
        if (hits.length >= MAX_RESULTS) break;
      }
    }
    return hits;
  }, [libraries, q]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[12vh] backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command
          shouldFilter={false}
          label="도서관 검색 및 필터"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              if (query) setQuery('');
              else onClose();
            }
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="도서관 이름·지역 검색, 또는 필터 선택…"
              className="flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-1.5">
            {loading && !libraries && (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                전국 도서관 목록 불러오는 중…
              </div>
            )}

            {q && (
              <Command.Empty className="py-6 text-center text-xs text-muted-foreground">
                “{query}”에 맞는 도서관이 없습니다
              </Command.Empty>
            )}

            {/* 필터 토글 + 시도: 검색어 없을 때만 */}
            {!q && (
              <>
                <Command.Group
                  heading="필터"
                  className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                >
                  <Item
                    active={filters.availableOnly}
                    icon={<Armchair className="size-4" />}
                    onSelect={() => setFilters((f) => ({ ...f, availableOnly: !f.availableOnly }))}
                  >
                    지금 자리 있는 곳만
                  </Item>
                  <Item
                    active={filters.realtimeOnly}
                    icon={<Armchair className="size-4" />}
                    onSelect={() => setFilters((f) => ({ ...f, realtimeOnly: !f.realtimeOnly }))}
                  >
                    실시간 좌석 제공하는 곳만
                  </Item>
                  <Item
                    active={filters.openNowOnly}
                    icon={<Clock className="size-4" />}
                    onSelect={() => setFilters((f) => ({ ...f, openNowOnly: !f.openNowOnly }))}
                  >
                    지금 문 연 곳만(추정)
                  </Item>
                </Command.Group>

                {regions.length > 0 && (
                  <Command.Group
                    heading="시도"
                    className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
                  >
                    {regions.map((r) => (
                      <Item
                        key={r.ctpv}
                        value={`ctpv-${r.ctpv}`}
                        active={filters.ctpv === r.ctpv}
                        icon={<MapPin className="size-4" />}
                        onSelect={() =>
                          setFilters((f) => ({ ...f, ctpv: f.ctpv === r.ctpv ? null : r.ctpv }))
                        }
                      >
                        <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                          <span className="truncate">{r.ctpv}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{r.count}곳</span>
                        </span>
                      </Item>
                    ))}
                  </Command.Group>
                )}
              </>
            )}

            {/* 이름 검색 결과 */}
            {q && results.length > 0 && (
              <Command.Group
                heading={`도서관 ${results.length}곳${results.length >= MAX_RESULTS ? '+' : ''}`}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
              >
                {results.map((c) => (
                  <Item
                    key={c.id}
                    value={`${c.id}-${c.name}`}
                    icon={<BookOpen className="size-4" />}
                    onSelect={() => onSelectLibrary(c.id)}
                  >
                    <span className="flex min-w-0 flex-1 items-baseline justify-between gap-2">
                      <span className="truncate">{c.name}</span>
                      {c.region && (
                        <span className="shrink-0 text-[11px] text-muted-foreground">{c.region}</span>
                      )}
                    </span>
                  </Item>
                ))}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

function Item({
  active,
  icon,
  onSelect,
  value,
  children,
}: {
  active?: boolean;
  icon: React.ReactNode;
  onSelect: () => void;
  value?: string;
  children: React.ReactNode;
}) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground"
    >
      <span className={active ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
      <span className="min-w-0 flex-1">{children}</span>
      {active && <span className="shrink-0 text-[11px] font-medium text-primary">적용됨</span>}
    </Command.Item>
  );
}
