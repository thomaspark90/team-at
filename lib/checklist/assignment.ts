import { DEFAULT_DUTY_TAGS, type DutyTag } from '@/lib/schedule/types';

export const DEFAULT_TAG_ORDER = DEFAULT_DUTY_TAGS.map((t) => t.key);
import type { StoreId } from '@/lib/types';

// 조 인원과 책임자 판정(순수) — 근무표 자동 제안 + 운영진 수정 + 대신 맡기. 화면·DB 를 모른다.

export interface CrewPerson {
  id: number;
  name: string;
  linked: boolean; // 로그인할 수 있는 계정이 명부에 연결돼 있는가
  dutyTag: DutyTag | null;
  joinedOn: string | null;
}

export interface CrewOverride {
  added: number[];
  removed: number[];
  leadStaffId: number | null;
}

export const NO_OVERRIDE: CrewOverride = { added: [], removed: [], leadStaffId: null };

// 책임 태그 우선순위 = 태그 목록의 순서(schedule_tags duty). 목록에 없는 태그·없음은 맨 뒤.
const rankOf = (p: CrewPerson, order: string[]) => {
  const i = p.dutyTag ? order.indexOf(p.dutyTag) : -1;
  return i < 0 ? order.length : i;
};

/**
 * 책임자 자동 선정 — 로그인 가능한 사람 → 책임 태그 순서(매니저 → 서브 매니저 …) → 입사일 빠른 순(공란은 뒤) → 이름 순.
 * 계정이 없는 사람이 책임자가 되면 아무도 제출할 수 없어 맨 앞에 둔다.
 */
export function pickLead(people: CrewPerson[], tagOrder: string[] = DEFAULT_TAG_ORDER): number | null {
  const sorted = [...people].sort(
    (a, b) =>
      Number(b.linked) - Number(a.linked) ||
      rankOf(a, tagOrder) - rankOf(b, tagOrder) ||
      (a.joinedOn ?? '9999').localeCompare(b.joinedOn ?? '9999') ||
      a.name.localeCompare(b.name, 'ko'),
  );
  return sorted[0]?.id ?? null;
}

/** 그날 조 — (자동 제안 + 운영진 추가 + 대신 맡은 사람) − 운영진 제외. 책임자는 지정값이 조에 있으면 그 사람, 아니면 자동 선정. */
export function resolveCrew(
  autoIds: number[],
  override: CrewOverride,
  takeoverIds: number[],
  people: Map<number, CrewPerson>,
  tagOrder: string[] = DEFAULT_TAG_ORDER,
): { memberIds: number[]; leadId: number | null } {
  const removed = new Set(override.removed);
  const memberIds = Array.from(new Set([...autoIds, ...override.added, ...takeoverIds])).filter((id) => !removed.has(id) && people.has(id));
  const leadId =
    override.leadStaffId != null && memberIds.includes(override.leadStaffId)
      ? override.leadStaffId
      : pickLead(memberIds.map((id) => people.get(id)!), tagOrder);
  return { memberIds, leadId };
}

/** 운영진이 고른 조 인원 → 저장할 수정값. 자동 제안과 같으면 추가·제외가 비고, 대신 맡은 사람은 추가로 치지 않는다. */
export function overrideFromMembers(autoIds: number[], takeoverIds: number[], members: number[], leadId: number | null): CrewOverride {
  const chosen = new Set(members);
  const auto = new Set(autoIds);
  const took = new Set(takeoverIds);
  return {
    added: members.filter((id) => !auto.has(id) && !took.has(id)),
    removed: autoIds.filter((id) => !chosen.has(id)),
    leadStaffId: leadId != null && chosen.has(leadId) ? leadId : null,
  };
}

/** 대신 맡을 수 있는가 — 운영진 또는 그 지점에서 근무하는 재직 직원(명부의 근무 지점 또는 계정 지점). */
export function canTakeOver(
  actor: { editor: boolean; staff: { active: boolean; stores: StoreId[] } | null; stores: string[] },
  store: StoreId,
): boolean {
  if (!actor.staff?.active) return false;
  return actor.editor || actor.staff.stores.includes(store) || actor.stores.includes(store);
}
