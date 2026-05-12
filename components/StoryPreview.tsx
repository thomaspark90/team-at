'use client';

import { forwardRef } from 'react';
import type { StoryData } from '@/lib/types';

interface Props {
  story: StoryData;
}

// 미리보기 360×640 → 다운로드 1080×1920 (3배)
const W = 360;
const H = 640;

// 배경 이미지의 하단 고정 영역 높이 (미리보기 기준)
// 원본 이미지에서 하단 고정 영역이 전체의 약 22%
const BOTTOM_FIXED_H = Math.round(H * 0.22); // ≈ 141px

const StoryPreview = forwardRef<HTMLDivElement, Props>(({ story }, ref) => {
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
      }}
    >
      {/* 고정 배경 이미지 */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/background.png"
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
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          lineHeight: 1,
        }}
      >
        <span
          style={{
            fontWeight: 800,
            fontSize: 15,
            color: '#1a1a1a',
            letterSpacing: '0.07em',
            lineHeight: 1,
          }}
        >
          {story.date} TODAY&apos;S MENU
        </span>
      </div>

      {/* 메뉴 본문 — 배경 하단 고정 영역 위까지만 사용 */}
      <div
        style={{
          position: 'absolute',
          top: 108,
          left: 0,
          right: 0,
          bottom: BOTTOM_FIXED_H,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          paddingLeft: 24,
          paddingRight: 24,
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
    </div>
  );
});

StoryPreview.displayName = 'StoryPreview';
export default StoryPreview;
