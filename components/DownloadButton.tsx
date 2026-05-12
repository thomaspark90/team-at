'use client';

import { RefObject, useState } from 'react';

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

    setLoading(false);
  };

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      style={{
        width: '100%',
        backgroundColor: loading ? '#7C7970' : '#1C1B19',
        color: '#FFFFFF',
        fontWeight: 600,
        fontSize: 14,
        padding: '14px',
        borderRadius: 12,
        border: 'none',
        cursor: loading ? 'not-allowed' : 'pointer',
        fontFamily: "'Pretendard Variable','Pretendard',sans-serif",
        letterSpacing: '0.01em',
        transition: 'background-color 0.15s',
      }}
    >
      {loading ? '이미지 생성 중...' : 'PNG 다운로드  ↓  1080 × 1920'}
    </button>
  );
}
