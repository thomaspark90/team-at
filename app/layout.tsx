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
  // 시스템 라이트/다크에 맞춰 브라우저 상단 바 색도 배경 토큰과 일치시킨다
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
    { media: '(prefers-color-scheme: dark)', color: '#0D0D0D' },
  ],
  width: 'device-width',
  initialScale: 1,
};

// <html>에 .dark 를 붙인다(tailwind darkMode:'class'). 수동 선택(localStorage 'theme':
// 'light'|'dark')이 있으면 그걸 우선하고, 없으면 시스템을 따른다(components/ThemeToggle.tsx 참조).
// 첫 페인트 전에 실행돼야 라이트로 번쩍이는 현상(FOUC)이 없어 인라인 스크립트로 넣는다.
// 시스템 변경 리스너도 매번 localStorage를 다시 읽어, 수동 선택 중엔 OS 변경을 무시한다.
const themeScript = `(function(){try{var m=window.matchMedia('(prefers-color-scheme: dark)');var a=function(){var t=null;try{t=localStorage.getItem('theme')}catch(e){}document.documentElement.classList.toggle('dark',t==='dark'||(t!=='light'&&m.matches))};a();m.addEventListener('change',a);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
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
