import type { BrewFeedback } from '@/lib/types';

// 추출 평가 칩 — 개선이 필요한 점만 고른다(좋았던 점 칩은 2026-10-30 대표 결정으로 없음).
// dir: 'under' = 덜 추출 신호(더 곱게), 'over' = 과다 추출 신호(더 굵게). id 는 저장값이라 바꾸지 않는다.
export type FeedbackDir = 'under' | 'over';
export const FEEDBACK_CHIPS: { id: string; label: string; dir: FeedbackDir }[] = [
  { id: 'sour', label: '산미가 튐', dir: 'under' },
  { id: 'watery', label: '전체적으로 묽음(워터리)', dir: 'under' },
  { id: 'weak-sweet', label: '단맛이 약함', dir: 'under' },
  { id: 'unclear', label: '선명하지 않음', dir: 'under' },
  { id: 'salty', label: '짭짤함', dir: 'under' },
  { id: 'astringent', label: '떫음', dir: 'over' },
  { id: 'bitter', label: '쓴맛', dir: 'over' },
  { id: 'muddy', label: '텁텁함', dir: 'over' },
  { id: 'muted', label: '향이 묻힘', dir: 'over' },
];
export const FEEDBACK_GROUPS: { dir: FeedbackDir; label: string }[] = [
  { dir: 'under', label: '덜 추출된 느낌' },
  { dir: 'over', label: '과하게 추출된 느낌' },
];
export const chipLabel = (id: string) => FEEDBACK_CHIPS.find((c) => c.id === id)?.label ?? id;

// 슬라이더 범위 — 그 지점 현재 분쇄도 ±0.5, 0.1 단위
export const MESH_SPAN = 0.5;
export const roundMesh = (n: number) => Math.round(n * 10) / 10;

// 칩 → 다음 분쇄도 제안. 한쪽 신호만 있으면 0.1 이동, 섞이면 제안 없음(채널링·물줄기 등 분쇄도 밖 문제일 수 있음)
export function suggestMesh(
  issues: string[],
  base: number | null
): { mesh: number | null; note: string } {
  const dirs = issues.map((id) => FEEDBACK_CHIPS.find((c) => c.id === id)?.dir).filter(Boolean);
  const under = dirs.filter((d) => d === 'under').length;
  const over = dirs.filter((d) => d === 'over').length;
  if (base == null) return { mesh: null, note: '' };
  if (under && !over) return { mesh: roundMesh(base - 0.1), note: `덜 추출된 신호 ${under}개 → 0.1 곱게 제안` };
  if (over && !under) return { mesh: roundMesh(base + 0.1), note: `과하게 추출된 신호 ${over}개 → 0.1 굵게 제안` };
  if (under && over) return { mesh: null, note: '양쪽 신호가 섞여 있어요 — 물줄기·채널링도 확인해 보세요' };
  return { mesh: base, note: '' };
}

// 분쇄도 변화 표기 — -0.1 → '−0.1 · 더 곱게'
export function meshDeltaText(base: number | null, next: number | null): string | null {
  if (base == null || next == null) return null;
  const d = roundMesh(next - base);
  if (d === 0) return '그대로';
  return d < 0 ? `−${Math.abs(d).toFixed(1)} · 더 곱게` : `+${d.toFixed(1)} · 더 굵게`;
}

// 같은 레시피 버전·지점 의견 집계 — 분쇄도 제안 분포 + 칩 빈도
export function summarize(list: BrewFeedback[]) {
  const deltas = new Map<string, number>();
  const chips = new Map<string, number>();
  const meshes: number[] = [];
  for (const f of list) {
    const t = meshDeltaText(f.baseMesh, f.nextMesh);
    if (t) deltas.set(t, (deltas.get(t) ?? 0) + 1);
    if (f.nextMesh != null) meshes.push(f.nextMesh);
    for (const id of f.issues) chips.set(id, (chips.get(id) ?? 0) + 1);
  }
  const avg = meshes.length ? meshes.reduce((a, b) => a + b, 0) / meshes.length : null;
  return {
    count: list.length,
    avgMesh: avg,
    deltas: Array.from(deltas.entries()).sort((a, b) => b[1] - a[1]),
    chips: Array.from(chips.entries()).sort((a, b) => b[1] - a[1]),
  };
}
