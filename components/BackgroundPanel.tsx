'use client';

import { useEffect, useRef, useState } from 'react';
import type { BlobItem } from '@/lib/types';

interface Props {
  selected: string;
  onSelect: (url: string) => void;
}

export default function BackgroundPanel({ selected, onSelect }: Props) {
  const [backgrounds, setBackgrounds] = useState<BlobItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadBackgrounds = async () => {
    const res = await fetch('/api/backgrounds');
    const data: BlobItem[] = await res.json();
    setBackgrounds(data);
    if (data.length > 0 && !selected) onSelect(data[0].url);
  };

  useEffect(() => { loadBackgrounds(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    await loadBackgrounds();
    onSelect(data.url);
    setUploading(false);
    e.target.value = '';
  };

  const handleDelete = async (url: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch('/api/backgrounds', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    await loadBackgrounds();
    if (selected === url) onSelect('');
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
              <img src={bg.url} alt="" className="w-full h-full object-cover" />
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
