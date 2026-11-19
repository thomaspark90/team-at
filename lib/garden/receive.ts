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

/** 수령 단계에서 아직 남은 일 — 둘 다 끝나야 수령 완료 */
export function receiveTodo(p: Pick<PurchaseRecord, 'roastDate' | 'beanEnConfirmed'>): {
  roastDate: boolean;
  beanEn: boolean;
  done: boolean;
} {
  const roastDate = !p.roastDate;
  const beanEn = !p.beanEnConfirmed;
  return { roastDate, beanEn, done: !roastDate && !beanEn };
}
