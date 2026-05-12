'use client';

import { useEffect, useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import type { BlobItem } from '@/lib/types';

interface Props {
  selected: string;
  onSelect: (url: string) => void;
}

export default function BackgroundPanel({ selected, onSelect }: Props) {
  const [backgrounds, setBackgrounds] = useState<BlobItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // onSelect를 포함하지 않는 순수 목록 갱신 함수
  const refresh = async (): Promise<BlobItem[]> => {
    const res = await fetch('/api/backgrounds');
    if (!res.ok) return [];
    const data: BlobItem[] = await res.json();
    setBackgrounds(data);
    return data;
  };

  // 최초 로드 시에만 선택 없으면 첫 번째 배경 자동 선택
  useEffect(() => {
    refresh().then((data) => {
      if (data.length > 0 && !selected) onSelect(data[0].url);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const blob = await upload(`backgrounds/${Date.now()}-${file.name}`, file, {
        access: 'public',
        handleUploadUrl: '/api/upload',
      });
      onSelect(blob.url);   // 미리보기 즉시 반영
      await refresh();       // 썸네일 목록만 갱신 (onSelect 재호출 없음)
    } catch (err) {
      console.error('Upload error:', err);
      alert('업로드에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDelete = async (url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch('/api/backgrounds', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await refresh();
    if (selected === url) onSelect(data.length > 0 ? data[0].url : '');
  };

  return (
    <div className="space-y-3">
      {backgrounds.length === 0 && !uploading && (
        <p className="text-sm text-gray-400">아직 배경이 없습니다. + 버튼으로 업로드하세요.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {backgrounds.map((bg) => (
          <div key={bg.url} className="relative group">
            <button
              onClick={() => onSelect(bg.url)}
              className={`w-16 h-16 rounded-lg overflow-hidden border-2 transition ${
                selected === bg.url ? 'border-yellow-400' : 'border-gray-200 hover:border-gray-400'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bg.url} alt="" className="w-full h-full object-cover" crossOrigin="anonymous" />
            </button>
            <button
              onClick={(e) => handleDelete(bg.url, e)}
              className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full text-xs leading-none hidden group-hover:flex items-center justify-center"
            >
              ×
            </button>
          </div>
        ))}

        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-16 h-16 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-yellow-400 hover:text-yellow-500 transition text-2xl"
        >
          {uploading ? <span className="text-xs">...</span> : '+'}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUpload}
      />
    </div>
  );
}
