// 잔당 재료비 구간별 권장 배수 — 판매가 설정 화면 참고표용 (2026-10-30 대표 결정).
// 고가 원두는 일반 배수(4~5.5)로는 판매가가 과해져 재료비가 오를수록 배수를 낮춘다.
// 아직 책정 산식(lib/pricing.ts)에는 연결하지 않은 참고값 — 구간 사이 재료비 처리(계단/보간) 미정.

export interface PriceBand {
  cost: number; // 잔당 재료비(원, VAT 포함 원가 기준) — 이 값 이상부터 적용
  minMult: number;
  maxMult: number;
}

export const PRICE_BANDS: PriceBand[] = [
  { cost: 1500, minMult: 4, maxMult: 5.5 }, // 기존 일반 구간 유지
  { cost: 2000, minMult: 3.5, maxMult: 5 },
  { cost: 2500, minMult: 3, maxMult: 4.5 },
  { cost: 3000, minMult: 2.5, maxMult: 4 },
  { cost: 3500, minMult: 2, maxMult: 3.5 },
  { cost: 4000, minMult: 2, maxMult: 3 }, // 4,000원 이상
];

// 참고표 축 — 재료비 1,500~5,000원(500원 단위) × 배수 2.00~6.00(0.25 단위)
export const GUIDE_COSTS = Array.from({ length: 8 }, (_, i) => 1500 + i * 500);
export const GUIDE_MULTS = Array.from({ length: 17 }, (_, i) => 2 + i * 0.25);

/** 재료비가 속한 권장 구간 (해당 재료비 이하 중 가장 높은 구간, 1,500원 미만은 첫 구간) */
export const bandForCost = (cost: number): PriceBand =>
  PRICE_BANDS.filter((b) => cost >= b.cost).at(-1) ?? PRICE_BANDS[0];

// 판매가는 lib/pricing 과 같이 100원 단위 올림
export const guidePrice = (cost: number, mult: number) => Math.ceil((cost * mult) / 100) * 100;

// 재료비 → 1kg 매입가(VAT 별도) 환산 — 기본 설정(수율 90%·도징 20g·VAT 1.1) 기준
export const kgPriceForCost = (cost: number) => (cost * 900) / 20 / 1.1;

// 참고표 칸 단위 권장 상태 — 판매가 설정 화면에서 칸을 클릭해 켜고 끈다 (서버 저장)
// key = 재료비(원) 문자열, value = 활성(권장) 배수 목록
export type ActiveCells = Record<string, number[]>;

/** 저장값이 없을 때의 기본 — PRICE_BANDS 구간을 칸으로 펼친 것 */
export const defaultActiveCells = (): ActiveCells =>
  Object.fromEntries(
    GUIDE_COSTS.map((cost) => {
      const b = bandForCost(cost);
      return [String(cost), GUIDE_MULTS.filter((m) => m >= b.minMult && m <= b.maxMult)];
    }),
  );

/** 축에 있는 칸만 남기고 정렬·중복 제거 — 저장 전후 정규화 */
export const cleanActiveCells = (raw: unknown): ActiveCells => {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    GUIDE_COSTS.map((cost) => {
      const arr = Array.isArray(src[String(cost)]) ? (src[String(cost)] as unknown[]) : [];
      const ms = GUIDE_MULTS.filter((m) => arr.some((v) => Number(v) === m));
      return [String(cost), ms];
    }),
  );
};

/** 발주 기록 재료비가 따를 참고표 행 — 계단식(해당 재료비 이하 중 가장 높은 행, 1,500원 미만은 첫 행) */
export const guideRowForCost = (cost: number): number =>
  GUIDE_COSTS.filter((c) => cost >= c).at(-1) ?? GUIDE_COSTS[0];
