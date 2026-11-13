import type { BrewFeedback, DripRecipe, PourStep } from '@/lib/types';
import { pourCountOf, withPourCount, withTotalWater } from '@/lib/garden/pour-count';
import { BYPASS_SUGGEST_G, WATER_STEP_G, roundMesh, wantsBypass } from '@/lib/garden/brew-feedback';
import { BYPASS_MAX_G, BYPASS_STEP_G, bypassOf, bypassText } from '@/lib/garden/bypass';

// 레시피 보드 '의견 · 레시피 수정' 탭 — 태블릿에서 − / + 버튼으로 레시피를 바로 고친다 (2026-11-13 대표 지시, 시안 C).
// 화면(components/garden/RecipeQuickEdit.tsx)은 그리기만 하고, 값 조절·의견 반영·저장 본문 계산은 전부 여기서 한다.
// 조절 단위: 분쇄도 0.1 · 추출량 5g · 가수 5g · 도징 1g · 온도 1° · 추출 시간 10초 — 범위는 필터 레시피 설정 창과 같다.

export interface QuickDraft {
  mesh: number | null; // 이 지점 EK43 다이얼
  waterG: number | null; // 총 추출량(푸어링 합)
  bypassG: number; // 가수(g) — 0 = 없음
  doseG: number | null;
  tempC: number | null;
  timeSec: number | null; // 추출 시간(초)
  pourCount: number | null; // 푸어링 횟수(뜸 제외) — 뜸으로 시작하지 않는 구 기록은 null(조절 불가)
}
export type QuickField = 'mesh' | 'waterG' | 'bypassG' | 'doseG' | 'tempC' | 'timeSec';

export const parseTime = (s: string | null | undefined): number | null => {
  const m = /^(\d+):([0-5]\d)$/.exec((s ?? '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
export const fmtTime = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

// 값이 비어 있을 때 첫 조절로 채울 기본값(fallback) — 매장 기준 HOT 레시피 근처
export const QUICK_FIELDS: Record<QuickField, { label: string; step: number; min: number; max: number; fallback: number | null; show: (v: number) => string }> = {
  mesh: { label: '분쇄도 EK43', step: 0.1, min: 4, max: 9, fallback: null, show: (v) => v.toFixed(1) },
  waterG: { label: '추출량', step: 5, min: 150, max: 300, fallback: 200, show: (v) => `${v}g` },
  bypassG: { label: '가수', step: BYPASS_STEP_G, min: 0, max: BYPASS_MAX_G, fallback: 0, show: bypassText },
  doseG: { label: '도징량', step: 1, min: 16, max: 24, fallback: 18, show: (v) => `${v}g` },
  tempC: { label: '온도', step: 1, min: 91, max: 94, fallback: 92, show: (v) => `${v}°` },
  timeSec: { label: '추출 시간', step: 10, min: 150, max: 240, fallback: 180, show: fmtTime },
};
export const QUICK_ORDER: QuickField[] = ['mesh', 'waterG', 'bypassG', 'doseG', 'tempC', 'timeSec'];

const total = (pours: PourStep[]) => pours.reduce((a, s) => a + s.water, 0);

/** 지금 레시피 → 조절 시작값. mesh 는 그 지점 다이얼(판교 화면의 양재천 대체 레시피면 환산값) */
export function draftOf(recipe: DripRecipe, storeMesh: number | null): QuickDraft {
  const pours = recipe.pours ?? [];
  return {
    mesh: storeMesh != null ? roundMesh(storeMesh) : null,
    waterG: pours.length ? total(pours) : recipe.waterG,
    bypassG: bypassOf(recipe),
    doseG: recipe.doseG,
    tempC: recipe.tempC,
    timeSec: parseTime(recipe.totalTime),
    pourCount: pours.length ? pourCountOf(pours) : null,
  };
}

/** 추출량·횟수를 바꿀 수 있는 레시피인지 — 푸어링이 없거나(총량만) 뜸으로 시작해야 다시 나눌 수 있다 */
export const canEditWater = (recipe: DripRecipe) => !recipe.pours?.length || pourCountOf(recipe.pours) != null;

/** − / + 한 번. 범위는 설정 창 옵션과 같되, 지금 값이 범위 밖이면 그 값까지는 허용한다 */
export function bump(draft: QuickDraft, orig: QuickDraft, field: QuickField, dir: 1 | -1): QuickDraft {
  const f = QUICK_FIELDS[field];
  const cur = draft[field];
  if (cur == null) return f.fallback == null ? draft : { ...draft, [field]: f.fallback };
  const lo = Math.min(f.min, orig[field] ?? f.min);
  const hi = Math.max(f.max, orig[field] ?? f.max);
  const next = Math.min(hi, Math.max(lo, Math.round((cur + dir * f.step) * 10) / 10));
  return { ...draft, [field]: next };
}

/** 조절값 → 푸어링. 총량·횟수가 그대로면 원래 차수별 물량을 건드리지 않는다 */
export function poursOf(recipe: DripRecipe, draft: QuickDraft): PourStep[] | null {
  const base = recipe.pours?.length ? recipe.pours : null;
  if (!base || pourCountOf(base) == null) return base;
  let p = base;
  if (draft.pourCount && draft.pourCount !== pourCountOf(base)) p = withPourCount(p, draft.pourCount);
  if (draft.waterG != null && draft.waterG !== total(p)) p = withTotalWater(p, draft.waterG);
  return p;
}

/** 조절값을 얹은 레시피 — 왼쪽 카드 미리보기와 저장 본문에 같이 쓴다. grindMesh 는 그 지점 다이얼 */
export function applyDraft(recipe: DripRecipe, draft: QuickDraft, orig: QuickDraft) {
  const pours = poursOf(recipe, draft);
  return {
    doseG: draft.doseG,
    waterG: pours ? total(pours) : draft.waterG,
    pours,
    bypassG: draft.bypassG > 0 ? draft.bypassG : null,
    tempC: draft.tempC,
    grindMesh: draft.mesh,
    // 시간을 안 건드렸으면 원래 표기 그대로(형식이 다른 구 기록 보존)
    totalTime: draft.timeSec === orig.timeSec || draft.timeSec == null ? recipe.totalTime : fmtTime(draft.timeSec),
  };
}

/** 바뀐 항목 문구 — 예: ['분쇄도 EK43 7.6 → 7.5', '추출량 230g → 220g'] */
export function quickChanges(orig: QuickDraft, draft: QuickDraft): string[] {
  const out: string[] = [];
  for (const k of QUICK_ORDER) {
    if (draft[k] === orig[k]) continue;
    const f = QUICK_FIELDS[k];
    out.push(`${f.label} ${orig[k] != null ? f.show(orig[k] as number) : '—'} → ${draft[k] != null ? f.show(draft[k] as number) : '—'}`);
  }
  if (draft.pourCount !== orig.pourCount) out.push(`푸어링 ${orig.pourCount ?? '—'}번 → ${draft.pourCount ?? '—'}번`);
  return out;
}

// 의견 한 건에서 뽑는 '적용' 버튼 — 다음 분쇄도 제안, 농도 칩(진함 = 물 +10g, 연함 = 물 −10g: suggestWater 와 같은 규칙),
// 떫음·텁텁함 = 추출량 −10g + 가수 +10g 묶음(suggestBypass 와 같은 규칙, 가수 상한 60g).
// 진함이 같이 있으면 물 +10g 대신 가수만 +10g — 두 제안이 추출량을 서로 반대로 건드리지 않게 하나로 합친다
export interface FeedbackAction {
  key: string;
  label: string;
  patch: Partial<QuickDraft>;
}
export function feedbackActions(f: Pick<BrewFeedback, 'issues' | 'nextMesh'>, orig: QuickDraft, waterEditable: boolean): FeedbackAction[] {
  const out: FeedbackAction[] = [];
  if (f.nextMesh != null && orig.mesh != null && roundMesh(f.nextMesh) !== orig.mesh) {
    const mesh = roundMesh(f.nextMesh);
    out.push({ key: 'mesh', label: `분쇄도 ${mesh.toFixed(1)} 적용`, patch: { mesh } });
  }
  const bypass = wantsBypass(f.issues) && orig.bypassG < BYPASS_MAX_G;
  if (waterEditable && orig.waterG != null && !bypass) {
    const sign = f.issues.includes('strong') ? 1 : f.issues.includes('weak') ? -1 : 0;
    if (sign) out.push({ key: 'water', label: `물 ${sign > 0 ? '+' : '−'}${WATER_STEP_G}g 적용`, patch: { waterG: orig.waterG + sign * WATER_STEP_G } });
  }
  if (bypass) {
    const bypassG = Math.min(BYPASS_MAX_G, orig.bypassG + BYPASS_SUGGEST_G);
    const add = bypassG - orig.bypassG;
    // 추출량을 같은 양만큼 줄일 수 있을 때만 묶음 — 진함이 같이 있거나, 추출량을 못 바꾸는 레시피·하한(150g)이면 가수만
    const swap = waterEditable && orig.waterG != null && orig.waterG - add >= QUICK_FIELDS.waterG.min && !f.issues.includes('strong');
    out.push(
      swap
        ? { key: 'bypass', label: `추출량 −${add}g + 가수 +${add}g 적용`, patch: { waterG: (orig.waterG as number) - add, bypassG } }
        : { key: 'bypass', label: `가수 +${add}g 적용`, patch: { bypassG } }
    );
  }
  return out;
}
export const isApplied = (draft: QuickDraft, patch: Partial<QuickDraft>) =>
  (Object.keys(patch) as (keyof QuickDraft)[]).every((k) => draft[k] === patch[k]);
