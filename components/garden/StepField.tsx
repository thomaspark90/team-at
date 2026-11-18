import type { ReactNode } from 'react';

// − / + 스테퍼 — 필터 레시피 설정 창을 태블릿 '바로 수정' 탭(RecipeQuickEdit)과 같은 조작으로 맞춘다 (2026-11-18 대표 지시).
// 그리기만 한다. 값 계산은 stepValue, 범위는 lib/garden/recipe-quick-edit.ts 의 QUICK_FIELDS 를 같이 쓴다.

const btnCls = 'rounded-md bg-background text-title shadow-soft-sm active:shadow-inset disabled:opacity-30 disabled:shadow-none';
const btnStyle: React.CSSProperties = { width: 40, height: 40, border: 'none', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1, flexShrink: 0 };

/** 한 걸음 옮긴 값. 비어 있으면 fallback 부터. 범위 밖 구 기록 값은 그 값까지는 허용한다 */
export function stepValue(cur: number | null, delta: number, f: { min: number; max: number; fallback: number | null }): number | null {
  if (cur == null) return f.fallback;
  const lo = Math.min(f.min, cur);
  const hi = Math.max(f.max, cur);
  return Math.min(hi, Math.max(lo, Math.round((cur + delta) * 10) / 10));
}

interface StepperProps {
  label: string; // 읽기 도구용 이름
  text: string; // 표시 값 — 예: '18g', '3:00'
  onStep: (dir: 1 | -1, big: boolean) => void;
  minusOff?: boolean;
  plusOff?: boolean;
  big?: boolean; // « » 큰 걸음 버튼
}

export function Stepper({ label, text, onStep, minusOff, plusOff, big }: StepperProps) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
      {big && (
        <button type="button" className={btnCls} style={btnStyle} disabled={minusOff} onClick={() => onStep(-1, true)} aria-label={`${label} 크게 줄이기`}>
          «
        </button>
      )}
      <button type="button" className={btnCls} style={btnStyle} disabled={minusOff} onClick={() => onStep(-1, false)} aria-label={`${label} 줄이기`}>
        −
      </button>
      <span className="tabular text-title" style={{ minWidth: 68, textAlign: 'center' }}>
        {text}
      </span>
      <button type="button" className={btnCls} style={btnStyle} disabled={plusOff} onClick={() => onStep(1, false)} aria-label={`${label} 늘리기`}>
        +
      </button>
      {big && (
        <button type="button" className={btnCls} style={btnStyle} disabled={plusOff} onClick={() => onStep(1, true)} aria-label={`${label} 크게 늘리기`}>
          »
        </button>
      )}
    </span>
  );
}

/** 한 줄: 왼쪽 이름(+보조 설명), 오른쪽 스테퍼 */
export default function StepField({ sub, ...p }: StepperProps & { sub?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 0 }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
        <span className="text-body text-foreground">{p.label}</span>
        {sub && <span className="tabular text-caption text-muted-foreground">{sub}</span>}
      </span>
      <Stepper {...p} />
    </div>
  );
}
