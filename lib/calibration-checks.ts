// 그라인더 드리프트 체크 — 월 2회(전반 1~15일 / 후반 16~말일) 지점별로 기준 원두를
// 다이얼 6.5로 1~2샷 측정해 캘리브레이션(2026-07-16 기준선)이 아직 유효한지 확인한다.
// 버는 계속 마모되므로 오프셋이 틀어지면 재캘리브레이션 신호.
import type { StoreId } from './types';

export type CheckStatus = 'todo' | 'doing' | 'done';

export interface CalibrationCheck {
  id: string;
  period: string; // '2026-07-H1' | '2026-07-H2'
  periodLabel: string; // '7월 전반' | '7월 후반'
  store: StoreId;
  status: CheckStatus;
  updatedAt?: string;
  updatedBy?: string;
  memo?: string; // 측정 결과 메모 (예: '6.5 → 918µm, 기준선 유지')
}

export const CHECK_COLUMNS: { status: CheckStatus; label: string }[] = [
  { status: 'todo', label: '할 일' },
  { status: 'doing', label: '진행 중' },
  { status: 'done', label: '완료' },
];

// 2026-07-16 캘리브레이션 기준선 (다이얼 6.5, 배전도 3종 × 3샷 = 9샷 평균) — 드리프트 판정용
export const BASELINE_UM: Record<StoreId, number> = { yangjae: 915.1, pangyo: 728.5 };
// 샷 간 반복성(SD 8~15µm) 기준 정상 오차 한계 — 초과 시 드리프트 경고
export const DRIFT_TOLERANCE_UM = 30;

// 체크 메모에서 측정 평균(µm) 추출 — 예: '6.5 → 918µm, 기준선 유지' → 918.
// 300~1500 범위의 첫 숫자를 측정값으로 본다 (다이얼 6.5 같은 소수는 범위 밖).
export function memoMicron(memo?: string): number | null {
  if (!memo) return null;
  const re = /(\d{3,4}(?:\.\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(memo)) !== null) {
    const n = Number(m[1]);
    if (n >= 300 && n <= 1500) return n;
  }
  return null;
}

export function periodOf(date: Date): { key: string; label: string } {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const half = date.getDate() <= 15 ? 'H1' : 'H2';
  return {
    key: `${y}-${String(m).padStart(2, '0')}-${half}`,
    label: `${m}월 ${half === 'H1' ? '전반' : '후반'}`,
  };
}
