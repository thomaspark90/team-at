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
    <div className="flex flex-col gap-8">
      {/* 모드 탭 */}
      <div className="flex gap-1 rounded-md border border-border p-1">
        {(['fixed', 'manual'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setMode(mode)}
            className={`flex-1 rounded-sm py-2 text-[13px] transition-colors ${
              story.inputMode === mode
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {mode === 'fixed' ? '카테고리 고정' : '직접 입력'}
          </button>
        ))}
      </div>

      {story.inputMode === 'fixed' ? (
        <div className="flex flex-col gap-10">
          {story.categories.map((cat, ci) => (
            <div key={ci}>
              <p className="mb-2 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{cat.name}</p>
              <div className="flex flex-col gap-1.5">
                {cat.items.map((item, ii) => (
                  <div key={ii} className="flex items-center gap-2">
                    <input
                      value={item}
                      onChange={(e) => updateItem(ci, ii, e.target.value)}
                      placeholder={`메뉴 ${ii + 1}`}
                      className="ta-input flex-1"
                    />
                    {cat.items.length > 1 && (
                      <button
                        onClick={() => removeItem(ci, ii)}
                        className="px-1 text-[15px] leading-none text-muted-foreground transition-colors hover:text-foreground"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => addItem(ci)}
                className="mt-2 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
              >
                + 항목 추가
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <p className="mb-2 text-[11px] text-muted-foreground">
            카테고리는 [대괄호]로 구분하세요. 빈 줄로 섹션을 나눌 수 있습니다.
          </p>
          <textarea
            value={story.manualText}
            onChange={(e) => onChange((s) => ({ ...s, manualText: e.target.value }))}
            placeholder={`[샐러드]\n폴렌타 스프\n구운가지 샐러드\n\n[탄수화물]\n버섯 알리오 올리오\n스탭밀 하프 버거`}
            rows={14}
            className="ta-input h-auto w-full resize-none py-3 leading-[1.7]"
          />
        </div>
      )}
    </div>
  );
}
