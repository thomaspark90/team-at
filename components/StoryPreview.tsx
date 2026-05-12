'use client';

import { forwardRef } from 'react';
import type { StoryData } from '@/lib/types';

interface Props {
  story: StoryData;
}

// 미리보기 크기: 360 × 640 (다운로드 1080 × 1920의 1/3)
const W = 360;
const H = 640;

const StoryPreview = forwardRef<HTMLDivElement, Props>(({ story }, ref) => {
  const fixedItems = story.categories.flatMap((cat) => [
    { type: 'category' as const, text: `[${cat.name}]` },
    ...cat.items.filter(Boolean).map((item) => ({ type: 'item' as const, text: item })),
  ]);

  return (
    <div
      ref={ref}
      style={{
        width: W,
        height: H,
        position: 'relative',
        overflow: 'hidden',
        flexShrink: 0,
        fontFamily: "'Pretendard Variable', 'Pretendard', sans-serif",
        backgroundColor: '#fdf8ee',
      }}
    >
      {/* 배경 이미지 */}
      {story.backgroundUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={story.backgroundUrl}
          src={story.backgroundUrl}
          alt=""
          crossOrigin="anonymous"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      )}

      {/* 날짜 배지 */}
      <div
        style={{
          position: 'absolute',
          top: 52,
          left: '50%',
          transform: 'translateX(-50%)',
          backgroundColor: '#F5C518',
          borderRadius: 8,
          padding: '9px 22px',
          whiteSpace: 'nowrap',
        }}
      >
        <span
          style={{
            fontWeight: 800,
            fontSize: 15,
            color: '#1a1a1a',
            letterSpacing: '0.07em',
          }}
        >
          {story.date} TODAY&apos;S MENU
        </span>
      </div>

      {/* 메뉴 본문 */}
      <div
        style={{
          position: 'absolute',
          top: 110,
          left: 0,
          right: 0,
          bottom: 130,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingLeft: 24,
          paddingRight: 24,
          gap: 0,
        }}
      >
        {story.inputMode === 'fixed' ? (
          <div style={{ textAlign: 'center', width: '100%' }}>
            {story.categories.map((cat, ci) => (
              <div key={ci} style={{ marginBottom: ci < story.categories.length - 1 ? 16 : 0 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 700,
                    color: '#1a1a1a',
                    marginBottom: 4,
                    letterSpacing: '0.02em',
                  }}
                >
                  [{cat.name}]
                </p>
                {cat.items.filter(Boolean).map((item, ii) => (
                  <p
                    key={ii}
                    style={{
                      fontSize: 13,
                      fontWeight: 400,
                      color: '#1a1a1a',
                      lineHeight: 1.85,
                    }}
                  >
                    {item}
                  </p>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div
            style={{
              textAlign: 'center',
              whiteSpace: 'pre-wrap',
              fontSize: 13,
              fontWeight: 400,
              color: '#1a1a1a',
              lineHeight: 1.85,
              width: '100%',
            }}
          >
            {story.manualText || (
              <span style={{ color: '#bbb' }}>메뉴를 입력해주세요</span>
            )}
          </div>
        )}
      </div>

      {/* 배경 없을 때 안내 */}
      {!story.backgroundUrl && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: 10,
            color: '#bbb',
          }}
        >
          배경 이미지를 선택하세요
        </div>
      )}
    </div>
  );
});

StoryPreview.displayName = 'StoryPreview';
export default StoryPreview;
