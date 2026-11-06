import { groupBySection } from './logic';

// 항목 순서 계산(순수) — 끌어서 옮기기·구역 이동·저장할 순서값. 화면·DB 를 모른다.

export interface Orderable {
  id: number;
  section: string;
}

export interface DropTarget {
  targetId: number;
  place: 'before' | 'after';
}

/** 항목을 다른 항목 앞·뒤로 옮긴다. 옮겨 간 자리의 구역을 따른다. */
export function moveItem<T extends Orderable>(list: T[], id: number, drop: DropTarget): T[] {
  const moving = list.find((i) => i.id === id);
  const target = list.find((i) => i.id === drop.targetId);
  if (!moving || !target || id === drop.targetId) return list;
  const rest = list.filter((i) => i.id !== id);
  const at = rest.findIndex((i) => i.id === drop.targetId) + (drop.place === 'after' ? 1 : 0);
  return [...rest.slice(0, at), { ...moving, section: target.section }, ...rest.slice(at)];
}

/** 구역 묶음을 통째로 한 칸 옮긴다. 끝에서는 그대로. */
export function moveSection<T extends Orderable>(list: T[], groupIndex: number, delta: -1 | 1): T[] {
  const groups = groupBySection(list);
  const to = groupIndex + delta;
  if (groupIndex < 0 || groupIndex >= groups.length || to < 0 || to >= groups.length) return list;
  [groups[groupIndex], groups[to]] = [groups[to], groups[groupIndex]];
  return groups.flatMap((g) => g.items);
}

/** 구역 끝에 넣는다. 없는 구역이면 목록 끝에 새로 만든다. */
export function insertAtSectionEnd<T extends Orderable>(list: T[], item: T): T[] {
  const last = list.map((i) => i.section).lastIndexOf(item.section);
  if (last < 0) return [...list, item];
  return [...list.slice(0, last + 1), item, ...list.slice(last + 1)];
}

/** 구역 묶음의 이름을 바꾼다. 같은 이름의 다른 묶음은 건드리지 않는다. */
export function renameSection<T extends Orderable>(list: T[], groupIndex: number, name: string): T[] {
  return groupBySection(list).flatMap((g, i) => (i === groupIndex ? g.items.map((it) => ({ ...it, section: name })) : g.items));
}

/** 목록 순서대로 10 간격 순서값. */
export function renumber<T extends Orderable>(list: T[]): (T & { sortOrder: number })[] {
  return list.map((i, n) => ({ ...i, sortOrder: (n + 1) * 10 }));
}
