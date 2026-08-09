'use client';

import { useEffect, useRef, useState } from 'react';
import type { BrewType, DripRecipe } from '@/lib/types';

// 추출 타이머 모드 — 바에서 저울 옆에 두고 쓰는 전체 화면 오버레이.
// 매장 레시피엔 단계별 시각이 없으므로 '다음 단계' 버튼으로 수동 진행한다.

const fmt = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

// '3:30' → 210초 (없거나 형식이 다르면 0)
const parseTime = (t: string) => {
  const m = t.match(/^(\d+):(\d{2})$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

type Phase = 'ready' | 'run' | 'done';

export default function BrewTimer({
  bean,
  brewType,
  recipe,
  onClose,
}: {
  bean: string;
  brewType: BrewType;
  recipe: DripRecipe;
  onClose: () => void;
}) {
  const steps = recipe.pours ?? [];
  const maxSec = parseTime(recipe.totalTime);
  const totalWater = steps.reduce((a, s) => a + s.water, 0) || recipe.waterG || 0;

  const [phase, setPhase] = useState<Phase>('ready');
  const [stepIdx, setStepIdx] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef(0);
  const doneAtRef = useRef(0);

  // 진행 중 0.2초 간격 갱신
  useEffect(() => {
    if (phase !== 'run') return;
    const id = setInterval(() => setElapsed((Date.now() - startRef.current) / 1000), 200);
    return () => clearInterval(id);
  }, [phase]);

  // 화면 꺼짐 방지 (지원 브라우저만)
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock
      ?.request('screen')
      .then((l) => {
        lock = l;
      })
      .catch(() => {});
    return () => {
      lock?.release().catch(() => {});
    };
  }, []);

  const vibrate = (ms: number) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate?.(ms);
  };

  const start = () => {
    startRef.current = Date.now();
    setElapsed(0);
    setStepIdx(0);
    setPhase('run');
    vibrate(20);
  };
  const next = () => {
    vibrate(20);
    if (stepIdx + 1 < steps.length) {
      setStepIdx(stepIdx + 1);
    } else {
      doneAtRef.current = (Date.now() - startRef.current) / 1000;
      setPhase('done');
    }
  };
  const reset = () => {
    setPhase('ready');
    setStepIdx(0);
    setElapsed(0);
  };

  const over = maxSec > 0 && phase === 'run' && elapsed > maxSec;
  const stepName = (i: number) => steps[i]?.label ?? (i === 0 ? '뜸' : `${i}차`);
  const cumTo = (i: number) => steps.slice(0, i + 1).reduce((a, s) => a + s.water, 0);
  const cur = steps[stepIdx];

  return (
    <div
      className="bg-background text-foreground"
      style={{ position: 'fixed', inset: 0, zIndex: 50, display: 'flex', flexDirection: 'column', padding: '20px 20px calc(20px + env(safe-area-inset-bottom))', overflowY: 'auto' }}
    >
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
          {/* ICE/HOT 배지 — 장식적 컬러 액센트 없이(§1) 텍스트로만 구분, 진한 단색 칩으로 강조 */}
          <span
            className="rounded-sm bg-foreground text-[11px] font-medium text-background"
            style={{ padding: '1px 6px', letterSpacing: '0.05em', flexShrink: 0 }}
          >
            {brewType.toUpperCase()}
          </span>
          <span className="text-[15px] font-medium" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {bean}
          </span>
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4, flexShrink: 0 }} aria-label="타이머 닫기">
          ×
        </button>
      </div>

      {/* 스펙 요약 */}
      <p className="tabular text-[13px] text-muted-foreground" style={{ margin: '6px 0 0' }}>
        {[
          recipe.doseG != null ? `도징 ${recipe.doseG}g` : null,
          totalWater ? `물 ${totalWater}g` : null,
          recipe.tempC != null ? `${recipe.tempC}°C` : null,
          // 지점 라벨 필수 — 판교 다이얼로 오인해 그대로 복사하는 사고 방지 (레시피 mesh는 양재천 기준)
          recipe.grindMesh != null ? `양재천 mesh ${recipe.grindMesh.toFixed(1)}` : null,
          maxSec ? `최대 ${recipe.totalTime}` : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </p>

      {/* 경과 시간 — 램프 밖 대형 타이머 숫자는 §7 명시 예외(DESIGN_SYSTEM.md) */}
      <div style={{ textAlign: 'center', margin: '26px 0 18px' }}>
        <div className={`tabular font-medium ${over ? 'text-destructive' : ''}`} style={{ fontSize: 64, lineHeight: 1 }}>
          {fmt(phase === 'done' ? doneAtRef.current : elapsed)}
        </div>
        {maxSec > 0 && (
          <div className={`tabular text-[13px] ${over ? 'text-destructive' : 'text-muted-foreground'}`} style={{ marginTop: 6 }}>
            {over ? `최대 ${recipe.totalTime} 초과 — 드리퍼 분리` : `최대 ${recipe.totalTime}`}
          </div>
        )}
      </div>

      {/* 현재 단계 크게 */}
      {phase === 'run' && cur && (
        <div className="rounded-md" style={{ border: '2px solid rgba(132, 204, 22, 0.55)', background: 'rgba(132, 204, 22, 0.14)', padding: '14px 16px', textAlign: 'center', marginBottom: 14 }}>
          <div className="text-[13px] text-muted-foreground">지금</div>
          <div className="tabular font-medium" style={{ fontSize: 28 }}>
            {stepName(stepIdx)} {cur.water}g
          </div>
          <div className="tabular text-[13px] text-muted-foreground">누적 {cumTo(stepIdx)}g까지 붓기</div>
        </div>
      )}
      {phase === 'done' && (
        <div className="rounded-md border border-border" style={{ padding: '14px 16px', textAlign: 'center', marginBottom: 14 }}>
          <div className="tabular font-medium" style={{ fontSize: 22 }}>추출 완료 · {fmt(doneAtRef.current)}</div>
          {totalWater > 0 && <div className="tabular text-[13px] text-muted-foreground">총 {totalWater}g</div>}
        </div>
      )}

      {/* 단계 리스트 */}
      {steps.length > 0 && (
        <div className="rounded-md border border-border" style={{ display: 'flex', flexDirection: 'column' }}>
          {steps.map((s, i) => {
            const done = phase === 'done' || i < stepIdx;
            const active = phase === 'run' && i === stepIdx;
            return (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '10px 14px',
                  borderTop: i > 0 ? '1px solid hsl(var(--border))' : 'none',
                  opacity: done ? 0.45 : 1,
                  background: active ? 'rgba(132, 204, 22, 0.14)' : undefined,
                }}
              >
                <span className="text-[15px]">
                  {done ? '✓ ' : ''}
                  {stepName(i)}
                </span>
                <span className="tabular text-[15px]">
                  {s.water}g <span className="text-muted-foreground">/ {cumTo(i)}g</span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <span style={{ flex: 1 }} />

      {/* 컨트롤 — 큰 버튼 (장갑 낀 손 기준) */}
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
        {phase === 'ready' && (
          <button onClick={start} className="ta-btn-primary" style={{ flex: 1, height: 56, fontSize: 15 }}>
            추출 시작
          </button>
        )}
        {phase === 'run' && (
          <>
            <button onClick={next} className="ta-btn-primary" style={{ flex: 1, height: 56, fontSize: 15 }}>
              {stepIdx + 1 < steps.length ? `다음 — ${stepName(stepIdx + 1)} ${steps[stepIdx + 1].water}g` : '추출 종료'}
            </button>
            <button onClick={reset} className="ta-btn" style={{ height: 56, paddingLeft: 18, paddingRight: 18 }}>
              리셋
            </button>
          </>
        )}
        {phase === 'done' && (
          <>
            <button onClick={reset} className="ta-btn" style={{ flex: 1, height: 56, fontSize: 15 }}>
              다시
            </button>
            <button onClick={onClose} className="ta-btn-primary" style={{ flex: 1, height: 56, fontSize: 15 }}>
              닫기
            </button>
          </>
        )}
      </div>
    </div>
  );
}
