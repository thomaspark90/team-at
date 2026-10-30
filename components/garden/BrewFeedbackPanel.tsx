'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BrewFeedback, BrewType, DripRecipe, StoreId } from '@/lib/types';
import {
  FEEDBACK_CHIPS,
  FEEDBACK_GROUPS,
  MESH_SPAN,
  chipLabel,
  meshDeltaText,
  roundMesh,
  suggestMesh,
  summarize,
} from '@/lib/garden/brew-feedback';
import { fmtDate } from '@/lib/garden/format';
import { toast } from '@/components/Toast';

// 추출 평가 — 레시피 보드 카드 아래. 이름 토글 → 개선 필요 칩 → 다음 분쇄도 슬라이더 → 남기기.
// 레시피는 바꾸지 않는다. 아래에 같은 지점·같은 레시피 버전의 의견 집계와 최근 의견.

// 선택지는 글자 토글(M1 스타일, 2026-10-30) — 면·그림자 없이 선택만 밑줄+진한 글자
function TextToggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`text-body ${on ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
      style={{
        background: 'none',
        border: 'none',
        borderBottom: `1px solid ${on ? 'hsl(var(--foreground))' : 'transparent'}`,
        padding: '4px 0',
        cursor: 'pointer',
        fontFamily: 'inherit',
      }}
    >
      {children}
    </button>
  );
}
const toggleRow: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', columnGap: 16, rowGap: 6 };

export default function BrewFeedbackPanel({
  store,
  beanKey,
  bean,
  brewType,
  recipe,
  baseMesh,
  staffNames,
  staff,
  onPickStaff,
  feedback,
  onSaved,
}: {
  store: StoreId;
  beanKey: string;
  bean: string;
  brewType: BrewType;
  recipe: DripRecipe;
  baseMesh: number | null; // 이 지점 현재 분쇄도 — 없으면 슬라이더 숨김
  staffNames: string[];
  staff: string; // 고른 이름 — 보드 전체 공유(카드마다 다시 고르지 않게)
  onPickStaff: (name: string) => void;
  feedback: BrewFeedback[]; // 이 원두·타입·지점 의견 전체
  onSaved: (rec: BrewFeedback) => void;
}) {
  const [issues, setIssues] = useState<string[]>([]);
  const [mesh, setMesh] = useState<number | null>(baseMesh);
  const [meshTouched, setMeshTouched] = useState(false);
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);

  // 레시피·지점이 바뀌면 입력 초기화
  useEffect(() => {
    setIssues([]);
    setMesh(baseMesh);
    setMeshTouched(false);
    setMemo('');
  }, [baseMesh, recipe.updatedAt, store]);

  const sug = suggestMesh(issues, baseMesh);
  // 슬라이더를 직접 만지기 전까지는 칩 제안을 따라간다
  useEffect(() => {
    if (!meshTouched && sug.mesh != null) setMesh(sug.mesh);
    else if (!meshTouched && sug.mesh == null) setMesh(baseMesh);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 칩 변화에만 반응
  }, [issues.join(',')]);

  const toggleIssue = (id: string) =>
    setIssues((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));

  const pickStaff = (n: string) => onPickStaff(staff === n ? '' : n);

  const submit = async () => {
    if (!staff || saving) return;
    setSaving(true);
    const res = await fetch('/api/garden-brew-feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staffName: staff,
        store,
        beanKey,
        bean,
        brewType,
        recipeVersion: recipe.updatedAt,
        issues,
        baseMesh,
        nextMesh: mesh,
        memo,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const j = await res?.json().catch(() => null);
      toast(j?.error ?? '저장에 실패했어요. 다시 시도해 주세요.', 'error');
      return;
    }
    onSaved(await res.json());
    setIssues([]);
    setMesh(baseMesh);
    setMeshTouched(false);
    setMemo('');
    toast('추출 평가를 남겼어요.');
  };

  // 현재 레시피 버전 의견만 집계, 이전 버전은 건수만
  const current = useMemo(() => feedback.filter((f) => f.recipeVersion === recipe.updatedAt), [feedback, recipe.updatedAt]);
  const olderCount = feedback.length - current.length;
  const sum = useMemo(() => summarize(current), [current]);
  const recent = useMemo(() => [...current].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3), [current]);

  const min = baseMesh != null ? roundMesh(baseMesh - MESH_SPAN) : 0;
  const max = baseMesh != null ? roundMesh(baseMesh + MESH_SPAN) : 1;
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const delta = meshDeltaText(baseMesh, mesh);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* 이름 토글 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="text-caption text-muted-foreground">이름</span>
        {staffNames.length === 0 ? (
          <span className="text-caption text-muted-foreground">설정 › 드롭다운 명단에 스탭이름을 추가해 주세요.</span>
        ) : (
          <div style={toggleRow}>
            {staffNames.map((n) => (
              <TextToggle key={n} on={staff === n} onClick={() => pickStaff(n)}>
                {n}님
              </TextToggle>
            ))}
          </div>
        )}
      </div>

      {/* 개선 필요 칩 */}
      {FEEDBACK_GROUPS.map((g) => (
        <div key={g.dir} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="text-caption text-muted-foreground">{g.label}</span>
          <div style={toggleRow}>
            {FEEDBACK_CHIPS.filter((c) => c.dir === g.dir).map((c) => (
              <TextToggle key={c.id} on={issues.includes(c.id)} onClick={() => toggleIssue(c.id)}>
                {c.label}
              </TextToggle>
            ))}
          </div>
        </div>
      ))}

      {/* 다음 분쇄도 슬라이더 — 흰 원 = 현재 값 */}
      {baseMesh != null && mesh != null ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span className="text-caption text-muted-foreground">다음 분쇄도</span>
            <span className="text-caption text-muted-foreground">좌우로 끌어서 조절</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="tabular text-display">{mesh.toFixed(1)}</span>
            <span className="text-body text-muted-foreground">{delta}</span>
          </div>
          <div style={{ position: 'relative', height: 40 }}>
            <div className="bg-muted" style={{ position: 'absolute', left: 0, right: 0, top: 19, height: 2 }} />
            <div
              className="bg-foreground"
              style={{ position: 'absolute', top: 19, height: 2, left: `${Math.min(pct(mesh), pct(baseMesh))}%`, width: `${Math.abs(pct(mesh) - pct(baseMesh))}%` }}
            />
            <div
              className="bg-background"
              style={{ position: 'absolute', top: 12, width: 16, height: 16, marginLeft: -8, borderRadius: 999, left: `${pct(baseMesh)}%`, boxShadow: 'inset 0 0 0 1.5px hsl(var(--muted-foreground))' }}
            />
            <div
              className="bg-foreground shadow-soft-sm"
              style={{ position: 'absolute', top: 8, width: 24, height: 24, marginLeft: -12, borderRadius: 999, left: `${pct(mesh)}%`, pointerEvents: 'none' }}
            />
            <input
              type="range"
              min={min}
              max={max}
              step={0.1}
              value={mesh}
              onChange={(e) => {
                setMeshTouched(true);
                setMesh(roundMesh(Number(e.target.value)));
              }}
              aria-label="다음 분쇄도"
              style={{ position: 'absolute', inset: 0, width: '100%', height: 40, margin: 0, opacity: 0, cursor: 'grab', touchAction: 'pan-y' }}
            />
          </div>
          <div className="tabular text-caption text-muted-foreground" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>← 곱게 {min.toFixed(1)}</span>
            <span>현재 {baseMesh.toFixed(1)}</span>
            <span>굵게 {max.toFixed(1)} →</span>
          </div>
        </div>
      ) : (
        <span className="text-caption text-muted-foreground">이 지점 분쇄도 값이 확정되지 않아 다음 분쇄도 제안은 받지 않아요.</span>
      )}

      {/* 메모 — 밑줄 한 줄짜리 면 없는 입력, 높이는 3줄 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <textarea
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          placeholder="메모 (선택)"
          maxLength={200}
          rows={3}
          className="w-full border-b border-border bg-transparent text-body text-foreground placeholder:text-muted-foreground focus:border-foreground"
          style={{ border: 'none', borderBottomWidth: 1, borderBottomStyle: 'solid', padding: '8px 0', resize: 'none', outline: 'none', lineHeight: 1.6, fontFamily: 'inherit' }}
        />
        <button
          onClick={submit}
          disabled={!staff || saving}
          className="text-body text-foreground disabled:text-muted-foreground"
          style={{ alignSelf: 'flex-end', background: 'none', border: 'none', padding: 0, cursor: staff ? 'pointer' : 'default', fontFamily: 'inherit' }}
        >
          {saving ? '남기는 중…' : staff ? '남기기 →' : '이름을 골라 주세요'}
        </button>
      </div>

      {/* 의견 집계 — 같은 지점·현재 레시피 버전 */}
      {(sum.count > 0 || olderCount > 0) && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
            <span className="text-body font-medium">최근 의견</span>
            <span className="tabular text-caption text-muted-foreground">
              이 버전 {sum.count}건
              {sum.avgMesh != null && ` · 제안 평균 ${sum.avgMesh.toFixed(2)}`}
              {olderCount > 0 && ` · 이전 버전 ${olderCount}건`}
            </span>
          </div>
          {sum.count > 0 && (
            <>
              <div className="tabular text-caption" style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {sum.deltas.map(([t, n]) => (
                  <span key={t}>
                    {t} <span className="text-muted-foreground">{n}</span>
                  </span>
                ))}
              </div>
              {sum.chips.length > 0 && (
                <div className="tabular text-caption text-muted-foreground">
                  {sum.chips.map(([id, n]) => `${chipLabel(id)} ${n}`).join(' · ')}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {recent.map((f) => (
                  <div key={f.id} className="border-b border-border last:border-b-0" style={{ padding: '8px 0' }}>
                    <p className="tabular text-caption text-muted-foreground" style={{ margin: 0 }}>
                      {f.staffName}님 · {fmtDate(f.createdAt)}
                      {meshDeltaText(f.baseMesh, f.nextMesh) && ` · ${meshDeltaText(f.baseMesh, f.nextMesh)}`}
                    </p>
                    {f.issues.length > 0 && (
                      <p className="text-caption" style={{ margin: '2px 0 0' }}>
                        {f.issues.map(chipLabel).join(' · ')}
                      </p>
                    )}
                    {f.memo && (
                      <p className="text-caption" style={{ margin: '2px 0 0' }}>
                        {f.memo}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
