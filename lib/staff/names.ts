// 직원 이름 표시 규칙(순수 함수 — 화면·API 공용).
// 발주·추출 평가의 과거 기록은 '소진'처럼 이름만 저장돼 있어, 원본을 고치지 않고 표시할 때만 명부 이름에 맞춘다.

export interface StaffNameRow {
  name: string;
  active: boolean;
}

export type RosterMatch = 'active' | 'left' | 'none';

/** 가입 신청 이름과 명부 대조 — 정확히 같은 이름만 일치로 본다(추정 연결 없음). */
export function rosterMatch(name: string, rows: StaffNameRow[]): RosterMatch {
  const hit = rows.find((r) => r.name === name);
  return !hit ? 'none' : hit.active ? 'active' : 'left';
}

export const leftLabel = (name: string) => `${name}(퇴사)`;

/** 명부에서 사람 찾기 — 정확히 같은 이름, 없으면 뒤가 일치하는 사람이 한 명뿐일 때만(소진 → 김소진). */
export function resolveStaffName(raw: string, rows: StaffNameRow[]): StaffNameRow | null {
  const exact = rows.find((r) => r.name === raw);
  if (exact) return exact;
  if (raw.length < 2) return null;
  const hits = rows.filter((r) => r.name.endsWith(raw));
  return hits.length === 1 ? hits[0] : null;
}

/** 기록에 보여줄 이름 — 명부 이름 + 퇴사 표시. 명부에 없는 이름은 그대로. */
export function staffLabel(raw: string, rows: StaffNameRow[]): string {
  const hit = resolveStaffName(raw, rows);
  if (!hit) return raw;
  return hit.active ? hit.name : leftLabel(hit.name);
}

/** 'OOO님' 표기 — 명부 이름이 이미 '길형님'이어도 겹치지 않고, 퇴사 표시는 뒤에 둔다. */
export function honorific(label: string): string {
  const left = label.endsWith('(퇴사)');
  const base = (left ? label.slice(0, -'(퇴사)'.length) : label).replace(/님$/, '');
  return `${base}님${left ? '(퇴사)' : ''}`;
}
