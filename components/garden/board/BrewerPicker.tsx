'use client';

import { useState } from 'react';
import { honorific } from '@/lib/staff/names';

// 「누가 추출하나요?」 창 — 보드에서 원두를 누르면 뜬다(2026-11-25 대표 결정).
// 이름 버튼을 누르는 것이 곧 들어가기(확인 버튼 없음). HOT · ICE 는 여기서 고르지 않고 추출 화면에서.
// 공용 태블릿이라 이름은 기억하지 않는다 — 들어올 때마다 새로 고른다.
// 추출이 아닌 일(대기 · 소진 · 판매 시작)은 아래 작은 글자 버튼 — 이름을 고르지 않아도 누를 수 있다.

const plainBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' };

export default function BrewerPicker({
  bean,
  staffNames,
  waiting,
  onEnter,
  onWaiting,
  onArchive,
  onClose,
}: {
  bean: string;
  staffNames: string[];
  waiting: boolean; // 이 지점 판매 대기 중 — '대기'·'소진' 대신 '판매 시작'
  onEnter: (name: string) => void;
  onWaiting: (on: boolean) => void;
  onArchive: () => void;
  onClose: () => void;
}) {
  const [confirmArchive, setConfirmArchive] = useState(false); // 소진 — 실수 방지로 한 번 더 확인
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgb(0 0 0 / 0.5)' }}
    >
      <div
        role="dialog"
        aria-label="누가 추출하나요?"
        onClick={(e) => e.stopPropagation()}
        className="bg-background"
        style={{ width: 'min(460px, 100%)', borderRadius: 16, padding: '28px 28px 22px', display: 'flex', flexDirection: 'column' }}
      >
        <h2 className="text-title font-medium" style={{ margin: '0 0 22px', lineHeight: 1.35, wordBreak: 'keep-all' }}>
          {bean}
        </h2>
        <span className="text-caption text-muted-foreground" style={{ marginBottom: 10 }}>
          누가 추출하나요?
        </span>
        {staffNames.length === 0 ? (
          <span className="text-caption text-muted-foreground">커피 역할인 재직자가 없습니다. 스케줄 › 직원 명부에서 역할을 지정해 주세요.</span>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            {staffNames.map((n) => (
              <button key={n} type="button" className="fc-namebtn text-body" onClick={() => onEnter(n)}>
                {honorific(n)}
              </button>
            ))}
          </div>
        )}
        <div className="text-body" style={{ display: 'flex', alignItems: 'baseline', gap: 18, marginTop: 24, whiteSpace: 'nowrap' }}>
          {confirmArchive ? (
            <>
              <span className="text-muted-foreground">아카이브로 보낼까요?</span>
              <button onClick={onArchive} className="text-foreground underline" style={plainBtn}>
                확인
              </button>
              <button onClick={() => setConfirmArchive(false)} className="text-muted-foreground hover:text-foreground" style={plainBtn}>
                취소
              </button>
            </>
          ) : waiting ? (
            <button
              onClick={() => onWaiting(false)}
              className="text-foreground underline"
              style={plainBtn}
              title="이 지점 판매 시작 — 레시피 보드에 올라가요"
            >
              판매 시작
            </button>
          ) : (
            <>
              <button
                onClick={() => onWaiting(true)}
                className="text-muted-foreground hover:text-foreground"
                style={plainBtn}
                title="이 지점 판매 대기 — 보드에서 빠지고 위쪽 '대기' 목록으로"
              >
                대기
              </button>
              <button
                onClick={() => setConfirmArchive(true)}
                className="text-muted-foreground hover:text-foreground"
                style={plainBtn}
                title="원두 소진 — 필터 커피 아카이브로 보내기"
              >
                소진
              </button>
            </>
          )}
          <span style={{ flex: 1 }} />
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" style={plainBtn}>
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
