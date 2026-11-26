import type { Spec, SpecUnit } from './types';

// 규격 해석(순수) — 상품 제목에서 낱개 양과 묶음 수를 읽는다.
// 틀리면 단위당 가격이 통째로 틀어지므로, 양이 두 가지로 읽히면 추측하지 않고 null(규격 미확인)을 낸다.

// 단위 뒤에 다른 영문자가 붙으면 단위가 아니다(예: 'gold'). 'x'는 묶음 표기(840gx10개)라 허용한다.
const QTY = /(\d+(?:\.\d+)?)\s*(kg|g|ml|l|ℓ|리터)(?![a-wyz])/gi;
const PACK = /(\d+)\s*(개입|개|입|봉|팩|병|캔|매)(?![가-힣])/g;

const toBase = (n: number, unit: string): { qty: number; unit: SpecUnit } => {
  const u = unit.toLowerCase();
  if (u === 'kg') return { qty: n * 1000, unit: 'g' };
  if (u === 'g') return { qty: n, unit: 'g' };
  if (u === 'ml') return { qty: n, unit: 'ml' };
  return { qty: n * 1000, unit: 'ml' }; // l · ℓ · 리터
};

export function parseSpec(title: string): Spec | null {
  const text = title.replace(/[×✕*]/g, 'x');
  const qtys = new Map<string, { qty: number; unit: SpecUnit }>();
  for (const m of Array.from(text.matchAll(QTY))) {
    const b = toBase(Number(m[1]), m[2]);
    if (b.qty > 0) qtys.set(`${b.qty}${b.unit}`, b);
  }
  const packs = new Set<number>();
  for (const m of Array.from(text.matchAll(PACK))) {
    const n = Number(m[1]);
    if (n > 0) packs.add(n);
  }
  if (qtys.size > 1 || packs.size > 1) return null;
  const pack = packs.size ? Array.from(packs)[0] : 1;
  if (qtys.size === 1) return { ...Array.from(qtys.values())[0], pack };
  if (packs.size === 1) return { qty: 1, unit: 'ea', pack };
  return null;
}

const num = (n: number) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

/** 화면 표기 — '454g × 20개', '10kg', '1L × 12개', '24개'. */
export function formatSpec(spec: Spec | null): string {
  if (!spec) return '규격 미확인';
  if (spec.unit === 'ea') return `${spec.pack * spec.qty}개`;
  const big = spec.qty >= 1000;
  const one = `${num(big ? spec.qty / 1000 : spec.qty)}${spec.unit === 'g' ? (big ? 'kg' : 'g') : big ? 'L' : 'ml'}`;
  return spec.pack > 1 ? `${one} × ${spec.pack}개` : one;
}

/** 비교 기준 단위 — 무게는 100g당, 부피는 1L당, 개수는 개당. */
export const BASE_LABEL: Record<SpecUnit, string> = { g: '100g당', ml: '1L당', ea: '개당' };

/** 상품 한 묶음 가격(원) → 기준 단위당 가격(원). */
export function unitPrice(price: number, spec: Spec): number {
  const total = spec.qty * spec.pack;
  const base = spec.unit === 'g' ? 100 : spec.unit === 'ml' ? 1000 : 1;
  return Math.round((price / total) * base);
}
