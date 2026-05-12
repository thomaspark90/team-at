'use client';

import { RefObject, useState } from 'react';

interface Props {
  previewRef: RefObject<HTMLDivElement | null>;
  date: string;
}

// 미리보기 360×640 → 다운로드 1080×1920 (3배 스케일)
const DOWNLOAD_SCALE = 3;

export default function DownloadButton({ previewRef, date }: Props) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (!previewRef.current) return;
    setLoading(true);

    // 폰트가 완전히 로드된 뒤 캡처
    await document.fonts.ready;

    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(previewRef.current, {
      scale: DOWNLOAD_SCALE,
      useCORS: true,
      logging: false,
      backgroundColor: null,
    });

    const filename = `menu-${date.replace(/\//g, '-')}.png`;
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();

    setLoading(false);
  };

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="w-full bg-yellow-400 hover:bg-yellow-500 disabled:opacity-50 text-gray-900 font-bold py-3 rounded-2xl transition shadow-sm text-sm"
    >
      {loading ? '이미지 생성 중...' : '⬇ PNG 다운로드 (1080 × 1920)'}
    </button>
  );
}
