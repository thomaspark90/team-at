'use client';

import { RefObject, useState } from 'react';
import { logUsage } from '@/lib/log-client';

interface Props {
  previewRef: RefObject<HTMLDivElement | null>;
  date: string;
}

const DOWNLOAD_SCALE = 3;

export default function DownloadButton({ previewRef, date }: Props) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    if (!previewRef.current) return;
    setLoading(true);

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

    logUsage('스탭밀 스토리 다운로드', date);
    setLoading(false);
  };

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="ta-btn-primary tabular h-12 w-full text-[13px]"
    >
      {loading ? '이미지 생성 중...' : 'PNG 다운로드  ↓  1080 × 1920'}
    </button>
  );
}
