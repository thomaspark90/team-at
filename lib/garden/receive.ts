import type { PurchaseRecord } from '@/lib/types';
import { normalize } from '@/lib/pricing';

// 원두 수령 · 영문명 확정 (2026-11-19 대표 결정).
// 발주 때 적는 영문명은 '임시'다 — 한글 이름만 보고 적으면 농장·품종 철자가 틀리기 쉽다.
// 택배를 받은 뒤 봉투에 인쇄된 표기를 보고(촬영 또는 타이핑) 확정하고, 원두카드는 확정명으로 만든다.
// 한 번 확정된 영문명은 같은 원두를 재발주할 때 그대로 이어받는다.

/** 이 날짜(KST) 발주분부터 작업 보드에 '수령' 카드가 선다 — 그 이전 기록은 발주 리스트에서만 기재 */
export const RECEIVE_FLOW_FROM = '2026-11-12';

type Rec = Pick<PurchaseRecord, 'bean' | 'beanEn' | 'beanEnConfirmed' | 'createdAt'>;

/** 같은 원두의 확정된 영문명 — 여러 건이면 가장 최근에 확정한 값 */
export function confirmedEnFor(records: Rec[], bean: string): string | null {
  const key = normalize(bean);
  if (!key) return null;
  let best: Rec | null = null;
  for (const r of records) {
    if (!r.beanEnConfirmed || !r.beanEn?.trim() || normalize(r.bean) !== key) continue;
    if (!best || r.beanEnConfirmed.at.localeCompare(best.beanEnConfirmed!.at) > 0) best = r;
  }
  return best?.beanEn?.trim() ?? null;
}

/** 수령 창에 필요한 발주 기록 조각 — 발주 화면은 기록 전체를, 작업 보드는 이 조각만 넘긴다 */
export type ReceiveTarget = Pick<
  PurchaseRecord,
  'id' | 'bean' | 'roastery' | 'store' | 'roastDate' | 'beanEn' | 'beanEnConfirmed' | 'cardRequested' | 'cardDone'
>;

/** 수령 담당자(설정 › 항목별 담당자 › 원두 수령 담당)가 지정돼 있으면 그 사람들만.
 *  null = 지정 없음 → 발주(pricing) 탭 권한으로 판단한다. 대표는 호출 쪽에서 항상 통과. */
export function receiveAssigned(assignees: string[] | undefined, email: string | null | undefined): boolean | null {
  const list = (assignees ?? []).map((e) => e.toLowerCase());
  if (list.length === 0) return null;
  return list.includes((email ?? '').toLowerCase());
}

/** 수령 단계에서 아직 남은 일 — 로스팅 날짜 → 영문명 확정 → 원두카드 요청 순.
 *  원두카드 요청은 영문명이 확정된 뒤에만 생긴다(확정 전 표기로 카드가 만들어지지 않게). */
export function receiveTodo(p: Pick<PurchaseRecord, 'roastDate' | 'beanEnConfirmed' | 'cardRequested' | 'cardDone'>): {
  roastDate: boolean;
  beanEn: boolean;
  cardRequest: boolean;
  done: boolean;
} {
  const roastDate = !p.roastDate;
  const beanEn = !p.beanEnConfirmed;
  const cardRequest = !beanEn && !p.cardRequested && !p.cardDone;
  return { roastDate, beanEn, cardRequest, done: !roastDate && !beanEn && !cardRequest };
}

const tokens = (s: string | null | undefined) =>
  normalize(s ?? '')
    .split(/[^0-9a-z가-힣]+/)
    .filter((t) => t.length >= 2);

/** 봉투 촬영 결과로 '어느 발주를 받은 건지' 고른다 — 한글 원두명·영문 표기·로스팅사가 겹치는 정도로 점수.
 *  후보가 하나뿐이면 그 발주, 여럿이면 점수가 가장 높은(동점 없는) 발주, 못 고르면 null(사람이 목록에서 고른다).
 *  골라 준 결과도 수령 창에서 한글 원두명을 보여 주고 사람이 확인한다. */
export function matchScanToPending<T extends Pick<PurchaseRecord, 'bean' | 'beanEn' | 'roastery'>>(
  scan: { beanName?: string | null; beanNameEn?: string | null; roastery?: string | null },
  pending: T[]
): T | null {
  if (pending.length === 0) return null;
  if (pending.length === 1) return pending[0];
  const ko = new Set(tokens(scan.beanName));
  const en = new Set(tokens(scan.beanNameEn));
  const roastery = normalize(scan.roastery ?? '');
  const scored = pending
    .map((p) => {
      let score = tokens(p.bean).filter((t) => ko.has(t)).length * 2;
      score += tokens(p.beanEn).filter((t) => en.has(t)).length * 2;
      const r = normalize(p.roastery ?? '');
      if (roastery && r && (r.includes(roastery) || roastery.includes(r))) score += 1;
      return { p, score };
    })
    .sort((a, b) => b.score - a.score);
  if (scored[0].score === 0 || scored[0].score === scored[1].score) return null;
  return scored[0].p;
}
