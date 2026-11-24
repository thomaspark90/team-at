import type { DripRecipe, PurchaseRecord, StoreId } from '@/lib/types';
import { STORES } from '@/lib/types';
import { normalize } from '@/lib/pricing';
import { baseDoseG, brewCost, dosesForBean } from '@/lib/garden/brew-cost';
import { storePrice } from '@/lib/garden/store-price';

// 판매가 설정 '책정 완료' 줄의 지점별 표기 (2026-11-19 대표 지시).
// 양재천·판교를 한 줄씩 — 판매가(VAT 포함 소비자가, 판교 = 양재천에서 구간별 차감, lib/garden/store-price)와
// 그 지점 레시피 도징 기준 재료비·재료비율(평균 · ICE · HOT). 판교 레시피가 없는 쪽은 양재천 도징으로 대신한다.

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const pct = (cost: number, price: number) => (price > 0 ? `${Math.round((cost / price) * 100)}%` : '—');
const ORDER: StoreId[] = ['yangjae', 'pangyo'];

export default function StorePriceLines({ rec, recipes }: { rec: PurchaseRecord; recipes: DripRecipe[] }) {
  return (
    <span className="tabular" style={{ display: 'inline-flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      {ORDER.map((id) => {
        const price = storePrice(rec.chosenPrice, id);
        if (price == null) return null;
        const d = dosesForBean(recipes, normalize(rec.bean), id);
        const base = brewCost(rec, baseDoseG(d.ice.doseG, d.hot.doseG));
        return (
          <span key={id} style={{ display: 'inline-flex', flexWrap: 'wrap', gap: '2px 16px', alignItems: 'baseline' }}>
            <span className="font-medium text-foreground">
              {STORES.find((s) => s.id === id)?.short} {won(price)}
            </span>
            <span className="text-muted-foreground">
              재료비 {won(base)} · 재료비율 {pct(base, price)} · ICE {pct(brewCost(rec, d.ice.doseG), price)} · HOT {pct(brewCost(rec, d.hot.doseG), price)}
            </span>
          </span>
        );
      })}
    </span>
  );
}
