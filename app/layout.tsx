import type { Metadata, Viewport } from 'next';
import { Toaster } from '@/components/Toast';
import { RefreshIndicator } from '@/components/Refresh';
import './globals.css';

export const metadata: Metadata = {
  // 페이지별 title 은 '지출 자료 분류 · team-at' 형태로 — 탭 여러 개 열고 쓸 때 구분용
  title: { default: 'team-at', template: '%s · team-at' },
  description: '카페 운영 도구 — 스탭밀 이미지 · 드립 판매가 산출',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'team-at' },
  icons: {
    icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="preload"
          href="/fonts/Freesentation-4Regular.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/Freesentation-5Medium.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="bg-bg text-fg">
        {children}
        <Toaster />
        <RefreshIndicator />
      </body>
    </html>
  );
}
