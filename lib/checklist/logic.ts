import { effectiveActual } from '@/lib/schedule/time';
import type { Shift } from '@/lib/schedule/types';
import type { StoreId } from '@/lib/types';
import type { ChecklistItem, ShiftType } from './types';

// 체크리스트 순수 계산 — 누구에게 무엇을 줄지, 제출해도 되는지. 날짜는 KST 'YYYY-MM-DD'.

/** 정기 휴무 요일(0=일) — 이날은 근무자가 있어도(준비 근무 등) 체크리스트를 주지 않는다. */
export const CLOSED_WEEKDAYS: Record<StoreId, number[]> = { pangyo: [], yangjae: [1] };

/**
 * 담당 지정(조·책임자) 사용 여부 — 2026-11-06 대표 결정: 기본은 '담당 없음'. 정착되면 true 로 켠다.
 * false 면 그 지점 재직자 누구나 오늘 체크리스트를 열어 체크·제출하고, 조 편성·책임 넘기기·대신 맡기는 숨긴다.
 */
export const CREW_ASSIGNMENT = false;

/** 직원에게 체크리스트를 주는 지점 — 판교 시범(2026-11-10~) 후 기준을 충족하면 양재를 더한다. 운영진은 전 지점을 보고 쓸 수 있다. */
export const ENABLED_STORES: StoreId[] = ['pangyo'];
export const isEnabledStore = (store: StoreId): boolean => ENABLED_STORES.includes(store);

/** 이날 이전은 운영 전이라 미제출로 치지 않는다. 시범이 미뤄지면 함께 옮긴다. */
export const STORE_START: Partial<Record<StoreId, string>> = { pangyo: '2026-11-10' };

/** 지난날인데 제출되지 않았는가 — 운영 시작 전 날짜는 제외. */
export function isMissed(store: StoreId, date: string, today: string, submittedAt: string | null): boolean {
  const start = STORE_START[store];
  return !submittedAt && date < today && !!start && date >= start;
}

/** 사진 보관 기간 — 지나면 사진만 지우고 체크 기록은 남긴다. */
export const PHOTO_RETENTION_DAYS = 90;
export const photoCutoff = (now: Date): string => new Date(now.getTime() - PHOTO_RETENTION_DAYS * 86_400_000).toISOString();

export const weekdayOf = (ymd: string): number => new Date(ymd + 'T00:00:00Z').getUTCDay();
export const isClosedDay = (store: StoreId, ymd: string): boolean => CLOSED_WEEKDAYS[store].includes(weekdayOf(ymd));

/**
 * 자동 제안 — 실제 근무 기준(달라진 것만 기록, 작성 중인 주의 계획은 제외).
 * 가장 일찍 시작하는 사람들 = 오픈, 가장 늦게 끝나는 사람들 = 마감. 한 명이면 두 장 다 그 사람.
 */
export function assignmentsFor(
  shifts: Shift[],
  store: StoreId,
  date: string,
  isPublished: (s: Shift) => boolean,
): Record<ShiftType, number[]> {
  const today = effectiveActual(
    shifts.filter((s) => s.store === store && s.date === date),
    isPublished,
  ).filter((s) => !s.isOff && s.start != null && s.end != null);
  if (today.length === 0) return { open: [], close: [] };
  const first = Math.min(...today.map((s) => s.start!));
  const last = Math.max(...today.map((s) => s.end!));
  const unique = (ids: number[]) => Array.from(new Set(ids));
  return {
    open: unique(today.filter((s) => s.start === first).map((s) => s.staffId)),
    close: unique(today.filter((s) => s.end === last).map((s) => s.staffId)),
  };
}

/** 이 날짜에 할 항목 — 켜진 것 중 매일 / 그 요일 / 매월 첫 그 요일. 표시 순서대로. */
export function itemsDue(items: ChecklistItem[], date: string): ChecklistItem[] {
  const dow = weekdayOf(date);
  const dayOfMonth = Number(date.slice(8, 10));
  return items
    .filter((i) => {
      if (!i.active) return false;
      if (i.frequency === 'daily') return true;
      if (i.weekday !== dow) return false;
      return i.frequency === 'weekly' || dayOfMonth <= 7;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

/** 제출을 막는 항목 — 체크도 사유도 없거나, 사진 필수인데 사진 없이 완료 처리된 항목. */
export function unfinishedItems(
  items: ChecklistItem[],
  checks: { itemId: number; status: 'done' | 'skipped'; hasPhoto: boolean }[],
): ChecklistItem[] {
  const byItem = new Map(checks.map((c) => [c.itemId, c]));
  return items.filter((i) => {
    const c = byItem.get(i.id);
    if (!c) return true;
    return c.status === 'done' && i.photoRequired && !c.hasPhoto;
  });
}

/** 구역별로 묶기 — 항목 순서를 유지한다. */
export function groupBySection<T extends { section: string }>(items: T[]): { section: string; items: T[] }[] {
  const out: { section: string; items: T[] }[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && last.section === it.section) last.items.push(it);
    else out.push({ section: it.section, items: [it] });
  }
  return out;
}
