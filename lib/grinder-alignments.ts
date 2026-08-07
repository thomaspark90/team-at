// 그라인더 얼라인먼트 이력 — 버 정렬·제로포인트 조정 등 그라인더를 물리적으로 손본 날을
// 지점별로 기록한다. 얼라인 이전 측정은 현재 그라인더 상태를 대표하지 못하므로,
// 차트·피팅에서 최근 얼라인 날짜 이전 데이터는 구분(흐림 표시·피팅 제외)한다.
import type { StoreId } from './types';

export interface AlignmentEvent {
  id: string;
  store: StoreId;
  date: string; // YYYY-MM-DD — 얼라인먼트 실시일
  memo?: string; // 예: '버 틀어짐 발견, 재정렬 완료'
  createdAt: string;
  createdBy?: string;
}

// 얼라인 날짜는 매장(KST) 기준 날짜로 입력·비교한다 — 측정 createdAt(UTC ISO)을 그대로
// 자르면 KST 오전 9시 이전 업로드가 전날로 분류되는 오류가 생긴다.
export const kstDate = (isoOrDate: string | Date = new Date()) =>
  new Date(isoOrDate).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });

export function latestAlignmentDate(events: AlignmentEvent[], store: StoreId): string | null {
  const dates = events
    .filter((e) => e.store === store)
    .map((e) => e.date)
    .sort();
  return dates.at(-1) ?? null;
}

// 측정(ISO 일시)이 해당 지점의 최근 얼라인 이후인지 — 얼라인 당일(KST) 측정은 이후로 간주.
// 얼라인 기록이 없으면 전부 현행으로 본다.
export function isPostAlignment(events: AlignmentEvent[], store: StoreId, isoDateTime: string): boolean {
  const last = latestAlignmentDate(events, store);
  if (!last) return true;
  return kstDate(isoDateTime) >= last;
}
