'use client';

import { useState } from 'react';
import { honorific } from '@/lib/staff/names';

// 「누가 추출하나요?」 창 — 보드에서 원두를 누르면 뜬다(2026-11-25 대표 결정).
// 이름 버튼을 누르는 것이 곧 들어가기(확인 버튼 없음). HOT · ICE 는 여기서 고르지 않고 추출 화면에서.
// 공용 태블릿이라 이름은 기억하지 않는다 — 들어올 때마다 새로 고른다.
// 추출이 아닌 일(대기 · 소진 · 판매 시작)은 창 아래 가운데 검정 알약 버튼 — 이름을 고르지 않아도 누를 수 있다.
// 대기 중(판매 전) 원두는 레시피 세팅 · 연습으로만 내린다(2026-11-26 대표 지시) — 창 위에 「대기 중 · 연습」 표시,
// 레시피가 아직 없는 원두는 「누가 레시피를 잡나요?」 — 이름을 누르면 레시피 설정으로 들어간다(2026-11-26 대표 지시).
// 대기 중 원두의 물음은 「누가 연습하나요?」, 「판매 시작」은 창 아래 가운데 검정 알약 버튼(누르면 「판매를 시작할까요?」 한 번 더 확인). 이때 남긴 평가는 「연습」으로 따로 표시된다.

const plainBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' };

export default function BrewerPicker({
  bean,
  staffNames,
  waiting,
  setup = false,
  onEnter,
  onWaiting,
  onArchive,
  onClose,
}: {
  bean: string;
  staffNames: string[];
  waiting: boolean; // 이 지점 판매 대기 중 — 연습 창(위 표시 · 물음 · 안내) + '대기'·'소진' 대신 '판매 시작'
  setup?: boolean; // 레시피가 아직 없는 원두 — 「누가 레시피를 잡나요?」. 이름을 누르면 레시피 설정으로 들어가고, 아래에는 닫기만
  onEnter: (name: string) => void;
  onWaiting: (on: boolean) => void;
  onArchive: () => void;
  onClose: () => void;
}) {
  const [confirmArchive, setConfirmArchive] = useState(false); // 소진 — 실수 방지로 한 번 더 확인
  const [confirmStart, setConfirmStart] = useState(false); // 판매 시작 — 가운데 큰 버튼이라 잘못 누르기 쉬워 한 번 더 확인(2026-11-26)
  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgb(0 0 0 / 0.5)' }}
    >
      <div
        role="dialog"
        aria-label={setup ? '누가 레시피를 잡나요?' : waiting ? '누가 연습하나요?' : '누가 추출하나요?'}
        onClick={(e) => e.stopPropagation()}
        className="bg-background"
        style={{ width: 'min(460px, 100%)', borderRadius: 16, padding: '28px 28px 22px', display: 'flex', flexDirection: 'column' }}
      >
        {waiting && (
          <span className="fc-practice text-caption" style={{ alignSelf: 'flex-start', marginBottom: 12 }}>
            {setup ? '대기 중 · 레시피 없음' : '대기 중 · 연습'}
          </span>
        )}
        <h2 className="text-title font-medium" style={{ margin: '0 0 22px', lineHeight: 1.35, wordBreak: 'keep-all' }}>
          {bean}
        </h2>
        <span className="text-caption text-muted-foreground" style={{ marginBottom: 10 }}>
          {setup ? '누가 레시피를 잡나요?' : waiting ? '누가 연습하나요?' : '누가 추출하나요?'}
        </span>
        {staffNames.length === 0 ? (
          <span className="text-caption text-muted-foreground">필터커피 내리는 사람이 지정되지 않았습니다. 가든서비스 › 설정에서 지정해 주세요.</span>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
            {staffNames.map((n) => (
              <button key={n} type="button" className="fc-namebtn text-body" onClick={() => onEnter(n)}>
                {honorific(n)}
              </button>
            ))}
          </div>
        )}
        {waiting && (
          <p className="text-caption text-muted-foreground" style={{ margin: '14px 0 0', wordBreak: 'keep-all' }}>
            {setup
              ? '아직 레시피가 없는 원두입니다. 이름을 누르면 레시피 설정으로 들어가고, 저장하면 그 이름이 레시피에 남습니다.'
              : '아직 판매 전인 원두입니다. 레시피 세팅 · 연습으로 내린 기록은 「연습」으로 따로 남습니다.'}
          </p>
        )}
        {setup ? (
          // 레시피 없는 원두 — 판매 시작 · 대기 · 소진은 레시피를 만든 뒤의 일이라 닫기만 둔다
          <div className="text-body" style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 24 }}>
            <button onClick={onClose} className="text-muted-foreground hover:text-foreground" style={plainBtn}>
              닫기
            </button>
          </div>
        ) : waiting ? (
          // 대기 중 원두 — 「판매 시작」을 창 아래 가운데 검정 알약 버튼으로(추출 평가의 「남기기」와 같은 모양, 2026-11-26 대표 지시). 닫기는 오른쪽
          <>
            {confirmStart && (
              <p className="text-body" style={{ margin: '24px 0 0', textAlign: 'center', wordBreak: 'keep-all' }}>
                판매를 시작할까요?
                <span className="text-caption text-muted-foreground" style={{ display: 'block', marginTop: 2 }}>
                  필터커피 라인업의 판매 중으로 올라갑니다.
                </span>
              </p>
            )}
            <div
              className="text-body"
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', marginTop: confirmStart ? 16 : 26, whiteSpace: 'nowrap' }}
            >
              <span />
              {confirmStart ? (
                <button type="button" onClick={() => onWaiting(false)} className="fc-fab text-body" style={{ height: 52, padding: '0 34px' }}>
                  시작하기
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmStart(true)}
                  className="fc-fab text-body"
                  style={{ height: 52, padding: '0 34px' }}
                  title="이 지점 판매 시작 — 필터커피 라인업에 올라가요"
                >
                  판매 시작
                </button>
              )}
              {confirmStart ? (
                <button onClick={() => setConfirmStart(false)} className="text-muted-foreground hover:text-foreground" style={{ ...plainBtn, justifySelf: 'end' }}>
                  취소
                </button>
              ) : (
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground" style={{ ...plainBtn, justifySelf: 'end' }}>
                  닫기
                </button>
              )}
            </div>
          </>
        ) : (
          // 판매 중 원두 — 「대기」·「소진」도 창 아래 가운데 검정 알약 버튼으로(2026-11-26 대표 지시: 빠르게 누를 수 있게). 닫기는 오른쪽.
          // 대기는 바로 적용(되돌리기 쉬움), 소진은 아카이브로 가므로 한 번 더 확인
          <>
            {confirmArchive && (
              <p className="text-body" style={{ margin: '24px 0 0', textAlign: 'center', wordBreak: 'keep-all' }}>
                소진 처리할까요?
                <span className="text-caption text-muted-foreground" style={{ display: 'block', marginTop: 2 }}>
                  필터 커피 아카이브로 보냅니다.
                </span>
              </p>
            )}
            <div
              className="text-body"
              style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center', marginTop: confirmArchive ? 16 : 26, whiteSpace: 'nowrap' }}
            >
              <span />
              {confirmArchive ? (
                <button type="button" onClick={onArchive} className="fc-fab text-body" style={{ height: 52, padding: '0 34px' }}>
                  소진하기
                </button>
              ) : (
                <span style={{ display: 'inline-flex', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => onWaiting(true)}
                    className="fc-fab text-body"
                    style={{ height: 52, padding: '0 30px' }}
                    title="이 지점 판매 대기 — 라인업 아래 '대기 중'으로 내려가요"
                  >
                    대기
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmArchive(true)}
                    className="fc-fab text-body"
                    style={{ height: 52, padding: '0 30px' }}
                    title="원두 소진 — 필터 커피 아카이브로 보내기"
                  >
                    소진
                  </button>
                </span>
              )}
              {confirmArchive ? (
                <button onClick={() => setConfirmArchive(false)} className="text-muted-foreground hover:text-foreground" style={{ ...plainBtn, justifySelf: 'end' }}>
                  취소
                </button>
              ) : (
                <button onClick={onClose} className="text-muted-foreground hover:text-foreground" style={{ ...plainBtn, justifySelf: 'end' }}>
                  닫기
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
