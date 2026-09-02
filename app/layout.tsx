import type { Metadata, Viewport } from 'next';
import { Noto_Sans_KR } from 'next/font/google';

import './globals.css';

/**
 * 루트 레이아웃. 국내 사용자용 한국어 앱이라 로케일 분기가 없다(`<html lang="ko">`).
 * 다크모드 기본은 형제앱과 통일. 폰트는 한글 본문에 맞는 Noto Sans KR.
 */
const notoSansKr = Noto_Sans_KR({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
});

const SITE = 'https://kr-library-now.vercel.app';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: '도서관나우 — 지금 자리 있는 도서관',
  description:
    '공공도서관 열람실의 실시간 잔여좌석을 지도에서. 내 주변 도서관의 지금 빈자리·운영시간·휴관 여부를 한눈에. 행정안전부 공공도서관 열람실 실시간 공식 데이터(수도권 위주).',
  keywords: ['도서관', '열람실', '실시간 좌석', '도서관 자리', '공부할 곳', '스터디카페 대안', '공공도서관'],
  alternates: { canonical: SITE },
  openGraph: {
    title: '도서관나우 — 지금 자리 있는 도서관',
    description: '공공도서관 열람실 실시간 잔여좌석을 지도에서. 내 주변부터.',
    url: SITE,
    siteName: '도서관나우',
    locale: 'ko_KR',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#0b0f19',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`dark ${notoSansKr.variable} antialiased`} suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground">{children}</body>
    </html>
  );
}
