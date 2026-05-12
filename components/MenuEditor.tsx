'use client';

import type { StoryData } from '@/lib/types';

interface Props {
  story: StoryData;
  onChange: React.Dispatch<React.SetStateAction<StoryData>>;
}

export default function MenuEditor({ story, onChange }: Props) {
  const setMode = (mode: 'fixed' | 'manual') =>
    onChange((s) => ({ ...s, inputMode: mode }));

  const updateItem = (catIdx: number, itemIdx: number, value: string) =>
    onChange((s) => ({
      ...s,
      categories: s.categories.map((cat, ci) =>
        ci === catIdx
          ? { ...cat, items: cat.items.map((item, ii) => (ii === itemIdx ? value : item)) }
          : cat
      ),
    }));

  const addItem = (catIdx: number) =>
    onChange((s) => ({
      ...s,
      categories: s.categories.map((cat, ci) =>
        ci === catIdx ? { ...cat, items: [...cat.items, ''] } : cat
      ),
    }));

  const removeItem = (catIdx: number, itemIdx: number) =>
    onChange((s) => ({
      ...s,
      categories: s.categories.map((cat, ci) =>
        ci === catIdx ? { ...cat, items: cat.items.filter((_, ii) => ii !== itemIdx) } : cat
      ),
    }));

  return (
    <div className="space-y-4">
      {/* 모드 전환 탭 */}
      <div className="flex gap-2">
        {(['fixed', 'manual'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setMode(mode)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition ${
              story.inputMode === mode
                ? 'bg-yellow-400 text-gray-900'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
            }`}
          >
            {mode === 'fixed' ? '카테고리 고정' : '직접 입력'}
          </button>
        ))}
      </div>

      {story.inputMode === 'fixed' ? (
        /* 카테고리 고정 모드 */
        <div className="space-y-5">
          {story.categories.map((cat, ci) => (
            <div key={ci}>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">
                [{cat.name}]
              </p>
              <div className="space-y-1.5">
                {cat.items.map((item, ii) => (
                  <div key={ii} className="flex gap-2 items-center">
                    <input
                      value={item}
                      onChange={(e) => updateItem(ci, ii, e.target.value)}
                      placeholder={`메뉴 ${ii + 1}`}
                      className="flex-1 border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
                    />
                    {cat.items.length > 1 && (
                      <button
                        onClick={() => removeItem(ci, ii)}
                        className="text-gray-300 hover:text-red-400 text-lg leading-none px-1"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => addItem(ci)}
                className="mt-1.5 text-xs text-yellow-600 hover:text-yellow-700 font-medium"
              >
                + 항목 추가
              </button>
            </div>
          ))}
        </div>
      ) : (
        /* 직접 입력 모드 */
        <div>
          <p className="text-xs text-gray-400 mb-2">
            카테고리는 [대괄호]로 구분하세요. 빈 줄로 섹션을 나눌 수 있습니다.
          </p>
          <textarea
            value={story.manualText}
            onChange={(e) => onChange((s) => ({ ...s, manualText: e.target.value }))}
            placeholder={`[샐러드]\n폴렌타 스프\n구운가지 샐러드\n요거트 과일 샐러드\n\n[탄수화물]\n버섯 알리오 올리오\n스탭밀 하프 버거`}
            rows={14}
            className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-none"
          />
        </div>
      )}
    </div>
  );
}
