'use client';

import { useEffect, useRef, useState } from 'react';
import { honorific } from '@/lib/staff/names';

// 이름 고르기 — 보드에서 원두 줄을 누르면 그 줄 아래로 펼쳐진다(2026-11-26 대표 결정 「1안 줄에서 펼치기」, 그 전에는 화면을 덮는 창).
// 이름 버튼을 누르는 것이 곧 들어가기(확인 버튼 없음). HOT · ICE 는 여기서 고르지 않고 추출 화면에서.
// 공용 태블릿이라 이름은 기억하지 않는다 — 들어올 때마다 새로 고른다.
// 추출이 아닌 일(대기 · 품절 · 판매 시작)은 이름 오른쪽 글자 버튼 — 이름을 고르지 않아도 누를 수 있다. 대기는 바로, 품절 · 판매 시작은 한 번 더 확인.
// 화면 말은 「소진」이 아니라 「품절」(2026-11-26 대표 지시) — 동작은 그대로 필터 커피 아카이브로 보내기.
// 판매 중 원두는 물음 없이 이름만. 대기 중 원두는 「누가 연습하나요?」(이때 남긴 평가는 「연습」으로 따로 표시),
// 레시피가 아직 없는 원두는 「누가 레시피를 잡나요?」 — 이름을 누르면 레시피 설정으로 들어간다.
// 닫기 버튼은 없다 — 같은 줄을 다시 누르면 접히고, 다른 줄을 누르면 그쪽이 펼쳐진다.

// 이름 버튼의 최소 폭 · 간격 — 태블릿 세로(744px)에서도 6명이 한 줄에 들어가는 값
const NAME_MIN = 96;
const NAME_GAP = 10;
// 글자 버튼 — 태블릿에서 누르기 쉽게 높이 44px
const actBtn: React.CSSProperties = { background: 'none', border: 'none', padding: '0 4px', minHeight: 44, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' };

export default function BrewerPicker({
  staffNames,
  waiting,
  setup = false,
  isMobile,
  onEnter,
  onWaiting,
  onArchive,
}: {
  staffNames: string[];
  waiting: boolean; // 이 지점 판매 대기 중 — 연습(물음 · 안내) + '대기'·'품절' 대신 '판매 시작'
  setup?: boolean; // 레시피가 아직 없는 원두 — 이름을 누르면 레시피 설정으로 들어가고, 오른쪽 버튼은 없다
  isMobile: boolean;
  onEnter: (name: string) => void;
  onWaiting: (on: boolean) => void;
  onArchive: () => void;
}) {
  const [confirmArchive, setConfirmArchive] = useState(false); // 품절 — 실수 방지로 한 번 더 확인
  const [confirmStart, setConfirmStart] = useState(false); // 판매 시작 — 한 번 더 확인
  const asking = confirmArchive || confirmStart;
  // 아래쪽 줄을 펼쳤을 때 이름이 화면 밖(아카이브 버튼 뒤)에 남지 않게
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, []);

  return (
    <div
      ref={ref}
      role="group"
      aria-label={setup ? '누가 레시피를 잡나요?' : waiting ? '누가 연습하나요?' : '누가 추출하나요?'}
      className="fc-beanpanel"
      // 왼쪽은 원두 이름과 같은 선(줄 안쪽 6 + 색 막대 8 + 간격 18)
      style={{ padding: isMobile ? '2px 6px 18px' : '2px 6px 22px 32px' }}
    >
      {(setup || waiting) && (
        <p className="text-caption text-muted-foreground" style={{ margin: '0 0 10px' }}>
          {setup ? '누가 레시피를 잡나요?' : '누가 연습하나요?'}
        </p>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: isMobile ? 6 : 16 }}>
        {staffNames.length === 0 ? (
          <span className="text-caption text-muted-foreground" style={{ flex: '1 1 240px' }}>
            필터커피 내리는 사람이 지정되지 않았습니다. 필터커피 › 내리는 사람에서 지정해 주세요.
          </span>
        ) : (
          <div
            style={{
              // 이름이 한 줄에 다 들어갈 폭을 먼저 잡는다 — 오른쪽 버튼까지 놓을 자리가 모자라면 이름이 꺾이는 대신 버튼이 아래 줄로 내려간다
              flex: `1 1 ${isMobile ? 320 : staffNames.length * NAME_MIN + (staffNames.length - 1) * NAME_GAP}px`,
              minWidth: 0,
              display: 'grid',
              gridTemplateColumns: isMobile ? 'repeat(3, minmax(0, 1fr))' : `repeat(auto-fill, minmax(${NAME_MIN}px, 1fr))`,
              gap: NAME_GAP,
            }}
          >
            {staffNames.map((n) => (
              <button key={n} type="button" className="fc-namebtn text-body" style={{ height: 58 }} onClick={() => onEnter(n)}>
                {honorific(n)}
              </button>
            ))}
          </div>
        )}
        {/* 레시피 없는 원두 — 판매 시작 · 대기 · 품절은 레시피를 만든 뒤의 일이라 버튼이 없다 */}
        {!setup && (
          <div
            className="text-body"
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              alignItems: 'center',
              justifyContent: 'flex-end',
              columnGap: 14,
              marginLeft: 'auto',
              // 확인을 물을 때는 문구가 길어 이름 아래 한 줄을 통째로 쓴다
              ...(asking ? { flex: '1 1 100%' } : {}),
            }}
          >
            {waiting ? (
              confirmStart ? (
                <>
                  <span style={{ wordBreak: 'keep-all' }}>
                    판매를 시작할까요? <span className="text-caption text-muted-foreground">필터커피 라인업의 판매 중으로 올라갑니다.</span>
                  </span>
                  <button type="button" onClick={() => onWaiting(false)} className="text-foreground underline underline-offset-4" style={actBtn}>
                    시작하기
                  </button>
                  <button type="button" onClick={() => setConfirmStart(false)} className="text-muted-foreground hover:text-foreground" style={actBtn}>
                    취소
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmStart(true)}
                  className="text-foreground underline underline-offset-4"
                  style={actBtn}
                  title="이 지점 판매 시작 — 필터커피 라인업에 올라가요"
                >
                  판매 시작
                </button>
              )
            ) : confirmArchive ? (
              <>
                <span style={{ wordBreak: 'keep-all' }}>
                  품절 처리할까요? <span className="text-caption text-muted-foreground">필터 커피 아카이브로 보냅니다.</span>
                </span>
                <button type="button" onClick={onArchive} className="text-foreground underline underline-offset-4" style={actBtn}>
                  품절 처리
                </button>
                <button type="button" onClick={() => setConfirmArchive(false)} className="text-muted-foreground hover:text-foreground" style={actBtn}>
                  취소
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onWaiting(true)}
                  className="text-muted-foreground hover:text-foreground"
                  style={actBtn}
                  title="이 지점 판매 대기 — 라인업 아래 '대기 중'으로 내려가요"
                >
                  대기
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmArchive(true)}
                  className="text-muted-foreground hover:text-foreground"
                  style={actBtn}
                  title="원두 품절 — 필터 커피 아카이브로 보내기"
                >
                  품절
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {waiting && (
        <p className="text-caption text-muted-foreground" style={{ margin: '12px 0 0', wordBreak: 'keep-all' }}>
          {setup
            ? '아직 레시피가 없는 원두입니다. 이름을 누르면 레시피 설정으로 들어가고, 저장하면 그 이름이 레시피에 남습니다.'
            : '아직 판매 전인 원두입니다. 레시피 세팅 · 연습으로 내린 기록은 「연습」으로 따로 남습니다.'}
        </p>
      )}
    </div>
  );
}
