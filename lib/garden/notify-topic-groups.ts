// 설정 › 항목별 담당자를 내비(GARDEN_NAV) 순서대로 묶는다 — 메뉴에서 본 순서 그대로 찾을 수 있게(2026-11-20).
// 묶음 이름·순서는 내비 정의를 그대로 따르므로, 내비를 바꾸면 설정 화면도 따라 바뀐다.
import { GARDEN_NAV, GARDEN_TABS } from '@/lib/garden/tabs';

export type NavGroup<T> = { key: string; label: string; items: T[] };

/** 내비에 속하지 않는 항목(예: 송금 요청)이 모이는 맨 끝 묶음 */
export const OTHER_GROUP_KEY = 'other';

/**
 * tab(가든 탭 key)이 달린 항목들을 내비 메뉴 순서로 묶는다.
 * 묶음 안에서는 메뉴의 하위 탭 순서 → 원래 순서. 빈 묶음은 만들지 않는다.
 */
export function groupByNav<T extends { tab?: string }>(items: T[], otherLabel = '기타'): NavGroup<T>[] {
  const groups: NavGroup<T>[] = [];
  const used = new Set<T>();
  for (const entry of GARDEN_NAV) {
    const own = [...entry.keys, ...(entry.hidden ?? [])].flatMap((k) => items.filter((it) => it.tab === k));
    if (own.length === 0) continue;
    own.forEach((it) => used.add(it));
    // 하위 탭이 하나뿐인 메뉴는 내비가 탭 이름을 그대로 보여준다(GardenNav 와 같은 규칙)
    const label =
      entry.keys.length === 1 ? GARDEN_TABS.find((t) => t.key === entry.keys[0])?.label ?? entry.label : entry.label;
    groups.push({ key: entry.keys[0], label, items: own });
  }
  const rest = items.filter((it) => !used.has(it));
  if (rest.length > 0) groups.push({ key: OTHER_GROUP_KEY, label: otherLabel, items: rest });
  return groups;
}
