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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: "'Pretendard Variable','Pretendard',sans-serif" }}>

      {/* 모드 탭 */}
      <div style={{ display: 'flex', gap: 6, backgroundColor: '#F3F3F3', borderRadius: 10, padding: 4 }}>
        {(['fixed', 'manual'] as const).map((mode) => (
          <button
            key={mode}
            onClick={() => setMode(mode)}
            style={{
              flex: 1,
              padding: '8px 0',
              borderRadius: 7,
              fontSize: 13,
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'all 0.15s',
              backgroundColor: story.inputMode === mode ? '#FFFFFF' : 'transparent',
              color: story.inputMode === mode ? '#1C1B19' : '#AAAAAA',
              boxShadow: story.inputMode === mode ? '0 1px 4px rgba(0,0,0,0.10)' : 'none',
            }}
          >
            {mode === 'fixed' ? '카테고리 고정' : '직접 입력'}
          </button>
        ))}
      </div>

      {story.inputMode === 'fixed' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {story.categories.map((cat, ci) => (
            <div key={ci}>
              <p style={{ fontSize: 11, fontWeight: 600, color: '#AAAAAA', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
                {cat.name}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cat.items.map((item, ii) => (
                  <div key={ii} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      value={item}
                      onChange={(e) => updateItem(ci, ii, e.target.value)}
                      placeholder={`메뉴 ${ii + 1}`}
                      style={{
                        flex: 1,
                        backgroundColor: '#F8F8F8',
                        border: '1px solid #EBEBEB',
                        borderRadius: 8,
                        padding: '9px 12px',
                        fontSize: 13,
                        color: '#1C1B19',
                        outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    />
                    {cat.items.length > 1 && (
                      <button
                        onClick={() => removeItem(ci, ii)}
                        style={{ color: '#CCCCCC', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 4px', fontFamily: 'inherit' }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={() => addItem(ci)}
                style={{ marginTop: 8, fontSize: 12, color: '#AAAAAA', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              >
                + 항목 추가
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <p style={{ fontSize: 12, color: '#AAAAAA', marginBottom: 8 }}>
            카테고리는 [대괄호]로 구분하세요. 빈 줄로 섹션을 나눌 수 있습니다.
          </p>
          <textarea
            value={story.manualText}
            onChange={(e) => onChange((s) => ({ ...s, manualText: e.target.value }))}
            placeholder={`[샐러드]\n폴렌타 스프\n구운가지 샐러드\n\n[탄수화물]\n버섯 알리오 올리오\n스탭밀 하프 버거`}
            rows={14}
            style={{
              width: '100%',
              backgroundColor: '#F8F8F8',
              border: '1px solid #EBEBEB',
              borderRadius: 10,
              padding: '12px 14px',
              fontSize: 13,
              color: '#1C1B19',
              outline: 'none',
              fontFamily: 'inherit',
              resize: 'none',
              lineHeight: 1.7,
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}
    </div>
  );
}
