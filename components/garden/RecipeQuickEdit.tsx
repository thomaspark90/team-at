'use client';

import { useEffect, useMemo, useState } from 'react';
import type { BrewFeedback, BrewType, DripRecipe, StoreId } from '@/lib/types';
import { honorific } from '@/lib/staff/names';
import { chipLabel, meshDeltaText } from '@/lib/garden/brew-feedback';
import { fmtDate } from '@/lib/garden/format';
import { POUR_COUNT_OPTS } from '@/lib/garden/pour-count';
import {
  QUICK_FIELDS,
  QUICK_ORDER,
  applyDraft,
  bump,
  canEditWater,
  draftOf,
  feedbackActions,
  isApplied,
  quickChanges,
  type QuickDraft,
  type QuickField,
} from '@/lib/garden/recipe-quick-edit';
import { TextToggle } from '@/components/garden/BrewFeedbackPanel';
import { toast } from '@/components/Toast';

// 레시피 보드 '의견 · 레시피 수정' 탭 (2026-11-13 대표 지시, 시안 C).
// 위: 이 레시피 버전에 남긴 최근 의견 + 제안을 한 번에 반영하는 '적용' 버튼. 아래: − / + 미세 조정 → 저장.
// 값 계산은 lib/garden/recipe-quick-edit.ts. 저장은 필터 레시피 탭과 같은 API(이력·알림 동일).

const RECENT_MAX = 5;
const stepBtn = 'rounded-md bg-background text-title shadow-soft-sm active:shadow-inset disabled:opacity-30 disabled:shadow-none';
const stepStyle: React.CSSProperties = { width: 44, height: 44, border: 'none', cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1, flexShrink: 0 };

export default function RecipeQuickEdit({
  store,
  beanKey,
  bean,
  brewType,
  recipe,
  baseMesh,
  isFallback,
  feedback,
  staffNames,
  staff,
  onPickStaff,
  onPreview,
  onSaved,
}: {
  store: StoreId;
  beanKey: string;
  bean: string;
  brewType: BrewType;
  recipe: DripRecipe;
  baseMesh: number | null; // 이 지점 현재 분쇄도 — 없으면 분쇄도 조절 숨김
  isFallback: boolean; // 판교 화면의 양재천 대체 레시피 — 저장하면 판교 레시피가 새로 생긴다
  feedback: BrewFeedback[]; // 이 원두·타입·지점 의견 전체
  staffNames: string[];
  staff: string;
  onPickStaff: (name: string) => void;
  onPreview: (r: DripRecipe | null) => void; // 조절 중인 값을 왼쪽 레시피 카드에 비춘다(null = 원래대로)
  onSaved: (r: DripRecipe) => void;
}) {
  const orig = useMemo(() => draftOf(recipe, baseMesh), [recipe, baseMesh]);
  const [draft, setDraft] = useState<QuickDraft>(orig);
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(orig), [orig]);

  const waterOk = canEditWater(recipe);
  const changes = quickChanges(orig, draft);
  const dirty = changes.length > 0;
  // 판교 대체 레시피인데 판교 분쇄도가 확정되지 않았으면(재측정 필요 등) 분쇄도 없는 판교 레시피가 생기므로 막는다
  const blocked = isFallback && baseMesh == null;

  // 왼쪽 카드 미리보기 — 바뀐 게 있을 때만. 탭을 떠나면 원래대로
  useEffect(() => {
    if (!dirty) {
      onPreview(null);
      return;
    }
    onPreview({ ...recipe, ...applyDraft(recipe, draft, orig), ...(store === 'pangyo' ? { store } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 조절값이 바뀔 때만
  }, [draft, orig, dirty]);
  useEffect(() => () => onPreview(null), []); // eslint-disable-line react-hooks/exhaustive-deps

  const current = useMemo(
    () => feedback.filter((f) => f.recipeVersion === recipe.updatedAt).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [feedback, recipe.updatedAt]
  );
  const olderCount = feedback.length - current.length;

  const save = async () => {
    if (!dirty || saving || blocked || (staffNames.length > 0 && !staff)) return;
    setSaving(true);
    const res = await fetch('/api/garden-recipes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        beanKey,
        brewType,
        store,
        bean,
        ...applyDraft(recipe, draft, orig),
        grind: draft.mesh != null ? '' : recipe.grind,
        notes: recipe.notes,
        presetId: recipe.presetId ?? null,
        updatedByName: staff || undefined,
      }),
    }).catch(() => null);
    setSaving(false);
    if (!res?.ok) {
      const j = await res?.json().catch(() => null);
      toast(j?.error ?? '레시피 저장에 실패했어요. 다시 시도해 주세요.', 'error');
      return;
    }
    onSaved((await res.json()) as DripRecipe);
    toast(`${bean} ${brewType.toUpperCase()} 레시피를 수정했어요.`);
  };

  const fields = QUICK_ORDER.filter((k) => (k === 'mesh' ? draft.mesh != null : k === 'waterG' ? waterOk : true));
  const row = (k: QuickField) => {
    const f = QUICK_FIELDS[k];
    const v = draft[k];
    return (
      <div key={k} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span className="text-body">{f.label}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className={stepBtn} style={stepStyle} onClick={() => setDraft((d) => bump(d, orig, k, -1))} aria-label={`${f.label} 줄이기`}>
            −
          </button>
          <span className="tabular" style={{ minWidth: 76, textAlign: 'center' }}>
            <span className="text-title" style={{ display: 'block', lineHeight: 1.2 }}>{v != null ? f.show(v) : '—'}</span>
            <span className="text-caption text-muted-foreground">{v === orig[k] ? '그대로' : `이전 ${orig[k] != null ? f.show(orig[k] as number) : '—'}`}</span>
          </span>
          <button className={stepBtn} style={stepStyle} onClick={() => setDraft((d) => bump(d, orig, k, 1))} aria-label={`${f.label} 늘리기`}>
            +
          </button>
        </span>
      </div>
    );
  };

  if (blocked) {
    return (
      <p className="text-body text-muted-foreground" style={{ margin: 0 }}>
        판교 분쇄도가 아직 확정되지 않아 여기서는 수정할 수 없어요. 필터 레시피 탭에서 판교 레시피를 먼저 저장해 주세요.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* 최근 의견 — 이 레시피 버전만. 제안은 버튼 한 번으로 아래 조절값에 반영(저장은 따로) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <span className="text-caption text-muted-foreground">최근 의견</span>
          <span className="tabular text-caption text-muted-foreground">
            이 버전 {current.length}건{olderCount > 0 && ` · 이전 버전 ${olderCount}건`}
          </span>
        </div>
        {current.length === 0 ? (
          <span className="text-body text-muted-foreground">이 레시피로 남긴 의견이 아직 없어요.</span>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {current.slice(0, RECENT_MAX).map((f) => {
              const acts = feedbackActions(f, orig, waterOk);
              const delta = meshDeltaText(f.baseMesh, f.nextMesh);
              return (
                <div key={f.id} className="border-b border-border last:border-b-0" style={{ padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <p className="tabular text-caption text-muted-foreground" style={{ margin: 0 }}>
                    {honorific(f.staffName)} · {fmtDate(f.createdAt)}
                    {delta && ` · 분쇄도 ${delta}`}
                  </p>
                  {f.issues.length > 0 && (
                    <p className="text-body" style={{ margin: 0 }}>
                      {f.issues.map(chipLabel).join(' · ')}
                    </p>
                  )}
                  {f.memo && (
                    <p className="text-body text-muted-foreground" style={{ margin: 0 }}>
                      {f.memo}
                    </p>
                  )}
                  {acts.length > 0 && (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                      {acts.map((a) => {
                        const on = isApplied(draft, a.patch);
                        return (
                          <button
                            key={a.key}
                            onClick={() => setDraft((d) => ({ ...d, ...a.patch }))}
                            aria-pressed={on}
                            className={`ta-btn tabular ${on ? 'text-muted-foreground' : ''}`}
                            style={on ? { boxShadow: 'var(--shadow-inset)' } : undefined}
                          >
                            {on ? `${a.label.replace(' 적용', '')} 적용됨 ✓` : a.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 미세 조정 — 분쇄도 0.1 · 추출량 5g · 도징 1g · 온도 1° · 추출 시간 10초 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span className="text-caption text-muted-foreground">레시피 조절</span>
        {fields.map(row)}
        {waterOk && draft.pourCount != null && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span className="text-body">푸어링 횟수 (뜸 제외)</span>
            <div className="ta-seg">
              {POUR_COUNT_OPTS.map((n) => (
                <button
                  key={n}
                  onClick={() => setDraft((d) => ({ ...d, pourCount: n }))}
                  className={`ta-seg-item ${draft.pourCount === n ? 'ta-seg-on' : ''}`}
                >
                  {n}번
                </button>
              ))}
            </div>
          </div>
        )}
        {!waterOk && <span className="text-caption text-muted-foreground">이 레시피는 푸어링 구성이 달라 추출량은 필터 레시피 탭에서 바꿔 주세요.</span>}
      </div>

      {/* 수정하는 사람 — 공용 태블릿이라 이름을 골라 이력에 남긴다(추출 평가와 같은 이름 선택) */}
      {staffNames.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span className="text-caption text-muted-foreground">수정하는 사람</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: 16, rowGap: 6 }}>
            {staffNames.map((n) => (
              <TextToggle key={n} on={staff === n} onClick={() => onPickStaff(staff === n ? '' : n)}>
                {honorific(n)}
              </TextToggle>
            ))}
          </div>
        </div>
      )}

      {/* 저장 — 바뀐 내용을 먼저 보여준다 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="tabular text-caption text-muted-foreground">
          {dirty ? changes.join(' · ') : '바꾼 값이 없어요'}
          {dirty && isFallback && ' — 저장하면 판교 레시피가 새로 생겨요'}
        </span>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="ta-btn" style={{ height: 44 }} disabled={!dirty || saving} onClick={() => setDraft(orig)}>
            되돌리기
          </button>
          <button
            className="ta-btn-primary"
            style={{ height: 44, flex: 1 }}
            disabled={!dirty || saving || (staffNames.length > 0 && !staff)}
            onClick={save}
          >
            {saving ? '저장 중…' : dirty && staffNames.length > 0 && !staff ? '이름을 골라 주세요' : '레시피 저장'}
          </button>
        </div>
      </div>
    </div>
  );
}
