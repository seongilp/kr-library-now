import Link from 'next/link';
import { Armchair, Clock, MapPin, Navigation, BookOpen, CircleAlert } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';

/**
 * 랜딩 페이지(서버 컴포넌트). 니치를 한 문장으로 세우고 지도로 보낸다.
 * SEO 를 위해 실제 설명 텍스트를 서버에서 렌더한다 — 지도 앱 본체는 클라이언트라 크롤러가
 * 못 읽으므로, 이 페이지가 색인의 근거가 된다.
 *
 * ★ 커버리지 한계를 첫 화면부터 정직하게 밝힌다(팀 지시): 실시간 좌석은 전국 일부(수도권 위주)만.
 */
export default function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-5 py-10">
      <div className="flex flex-1 flex-col justify-center">
        <div className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
          <BookOpen className="size-3.5 text-primary" />
          행정안전부 공공도서관 열람실 실시간 공식 데이터
        </div>

        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          지금 자리 있는
          <br />
          도서관, 지도에서.
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          공공도서관 열람실의 <strong className="text-foreground">실시간 잔여좌석</strong>을 내 주변부터
          보여줍니다. 오늘 문 여는지, 몇 시까지 하는지, 지금 몇 자리 비었는지 한눈에.
        </p>

        <div className="mt-8">
          <Link
            href="/map"
            className={buttonVariants({
              size: 'lg',
              className: 'h-12 w-full gap-2 text-base sm:w-auto sm:px-8',
            })}
          >
            <Navigation className="size-4" />
            지도 열기
          </Link>
        </div>

        <ul className="mt-12 grid gap-4 text-sm sm:grid-cols-2">
          <Feature icon={<Armchair className="size-5 text-primary" />}>
            열람실별 실시간 잔여좌석. 만석(0석)과 &lsquo;정보 미제공&rsquo;을 분명히 구분해 보여줍니다.
          </Feature>
          <Feature icon={<MapPin className="size-5 text-primary" />}>
            현재 위치 기준 가까운 도서관부터. 위치를 못 잡으면 서울 기준으로 보여줍니다.
          </Feature>
          <Feature icon={<Clock className="size-5 text-emerald-400" />}>
            오늘 운영시간·휴관 여부. &lsquo;지금 여는가&rsquo;를 휴관일 정보로 추정해 표시합니다.
          </Feature>
          <Feature icon={<Navigation className="size-5 text-amber-400" />}>
            길찾기·전화·홈페이지 바로가기.
          </Feature>
        </ul>

        {/* 한계를 첫 화면부터 정직하게 — 전국 완전 커버가 아니다. */}
        <p className="mt-8 flex gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-relaxed text-muted-foreground">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <span>
            실시간 좌석을 제공하는 도서관은 <strong className="text-foreground">전국 약 120곳(경기·서울 등 수도권 위주)</strong>입니다.
            내 지역에 없을 수 있습니다. 좌석 수는 각 도서관 시스템이 올린 값이며, 실제와 시차가 있을 수
            있습니다. 좌석 예약·발권은 각 도서관에서 확인하세요.
          </span>
        </p>
      </div>

      <footer className="mt-10 border-t border-border pt-4 text-xs text-muted-foreground">
        데이터 출처: 행정안전부 한국지역정보개발원 · (전국 통합데이터) 공공도서관 열람실 실시간 정보 · 좌표 WGS84
      </footer>
    </main>
  );
}

function Feature({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span className="text-muted-foreground">{children}</span>
    </li>
  );
}
