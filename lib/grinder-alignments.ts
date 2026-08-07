// 그라인더 얼라인먼트 이력 — 버 정렬·제로포인트 조정 등 그라인더를 물리적으로 손본 날을
// 지점별로 기록한다. 얼라인 이전 측정은 현재 그라인더 상태를 대표하지 못하므로,
// 차트·피팅에서 최근 얼라인 날짜 이전 데이터는 구분(흐림 표시·피팅 제외)한다.
import type { StoreId } from './types';

export interface AlignmentEvent {
  id: string;
  store: StoreId;
  date: string; // YYYY-MM-DD — 얼라인먼트 실시일
  /** 'align'(기본) = 재정렬 등 물리적 조정, 'check' = 정기 점검 결과 이상 없음(그라인더 상태 불변) */
  kind?: 'align' | 'check';
  memo?: string; // 예: '버 틀어짐 발견, 재정렬 완료'
  createdAt: string;
  createdBy?: string;
}

// 얼라인 날짜는 매장(KST) 기준 날짜로 입력·비교한다 — 측정 createdAt(UTC ISO)을 그대로
// 자르면 KST 오전 9시 이전 업로드가 전날로 분류되는 오류가 생긴다.
export const kstDate = (isoOrDate: string | Date = new Date()) =>
  new Date(isoOrDate).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

// 물리적 조정('align')만 본다 — 점검(이상 없음)은 그라인더 상태를 바꾸지 않으므로
// 측정 유효성(얼라인 이전 데이터 흐림·제외) 판정에 영향을 주면 안 된다.
export function latestAlignmentDate(events: AlignmentEvent[], store: StoreId): string | null {
  const dates = events
    .filter((e) => e.store === store && e.kind !== 'check')
    .map((e) => e.date)
    .sort();
  return dates.at(-1) ?? null;
}

// ── 정기 얼라인 점검 리마인더 — 마지막 확인(재정렬이든 점검이든)에서 3개월 지나면 작업 보드에 카드 ──
export const ALIGN_REMINDER_MONTHS = 3;

/** 재정렬·점검을 통틀어 마지막으로 그라인더를 확인한 날 */
export function latestInspectionDate(events: AlignmentEvent[], store: StoreId): string | null {
  const dates = events
    .filter((e) => e.store === store)
    .map((e) => e.date)
    .sort();
  return dates.at(-1) ?? null;
}

// YYYY-MM-DD + n개월 — 말일 넘침은 그 달 말일로 고정 (예: 11-30 +3 → 02-28)
function addMonths(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = total % 12; // 0-based
  const lastDay = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm + 1).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

/** 점검이 밀렸는지 — 기록이 없거나 마지막 확인 후 3개월 경과(KST 오늘 기준) */
export function alignmentOverdue(
  events: AlignmentEvent[],
  store: StoreId,
  todayStr = kstDate()
): { due: boolean; last: string | null } {
  const last = latestInspectionDate(events, store);
  if (!last) return { due: true, last: null };
  return { due: addMonths(last, ALIGN_REMINDER_MONTHS) <= todayStr, last };
}

// 측정(ISO 일시)이 해당 지점의 최근 얼라인 이후인지 — 얼라인 당일(KST) 측정은 이후로 간주.
// 얼라인 기록이 없으면 전부 현행으로 본다.
export function isPostAlignment(events: AlignmentEvent[], store: StoreId, isoDateTime: string): boolean {
  const last = latestAlignmentDate(events, store);
  if (!last) return true;
  return kstDate(isoDateTime) >= last;
}
