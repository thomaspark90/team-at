import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Story Maker',
  description: '인스타그램 스토리 메뉴판 생성기',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          as="style"
          crossOrigin="anonymous"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="bg-gray-100">{children}</body>
    </html>
  );
}
