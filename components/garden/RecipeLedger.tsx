'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import type { BrewType } from '@/lib/types';
import { restStage, restTitle, type RoastInfo } from '@/lib/garden/roast';
import { restClass } from './rest-class';
import LedgerPriceCell from '@/components/garden/LedgerPriceCell';
import type { PurchaseRecord } from '@/lib/types';

// 필터커피 목록(2026-11-03 대표 결정: 시안 C3 '인덱스 + 펼침').
// 2026-11-24 디자인 개선: 흰 바탕·음영 구분, 한 줄 6칸(원두 · 발주→로스팅 · HOT · ICE · 판매가 · 재료비율),
// 재료비/이익 막대와 발주 단가는 펼침으로, 할 일은 「● ○○ 필요」 한 가지 말투로.
// 한 원두 = 한 줄 인덱스 — 날짜는 발주 → 로스팅 → D+N 흐름, ICE·HOT 은 비율(없으면 '레시피 설정 필요'),
// 이익은 재료비/이익 막대(ICE·HOT 평균 도징 기준, 2026-11-03 — 이전엔 HOT 우선). 줄을 누르면 원가 계산 + 기존 카드(수정·이력·보관)가 펼쳐진다.
// 정렬: 설정 필요 먼저(기본) · 이익 높은순 · 로스팅 오래된순. 데이터 가공은 GardenDashboard 가 하고, 여기는 표시만 맡는다.

export type LedgerSlot = {
  ratio: string | null; // '1:8.6'
  doseG: number | null;
  waterG: number | null;
  tempC: number | null;
  grind: string | null;
  totalTime: string;
  cost: number | null; // 잔당 재료비(원) — 최신 발주가 g당 원가 × 도징량
  fallback: boolean; // 판교에 레시피가 없어 양재천 레시피를 보여주는 중
};

export type LedgerRow = {
  beanKey: string;
  bean: string;
  country: string;
  roastery?: string;
  orderDate: string | null; // YYYY-MM-DD 또는 ISO
  roast: RoastInfo | null; // 로스팅일 — 미기재면 발주일+1 추정(estimated)
  price: number | null; // 보고 있는 지점의 판매가(원, VAT 포함 소비자가) — 판교는 양재천 책정가에서 구간별 차감
  priceNote: string | null; // 양재천 대비 차액 문구 — 있으면 파생값이라 이 화면에서 수정하지 않는다. 화면에는 표기하지 않는다(2026-11-19 대표 지시)
  purchaseId: string | null; // 판매가가 저장된 최신 발주 기록 — 판매가 칸 인라인 수정 대상
  priceNeeded: boolean; // 발주는 됐는데 판매가가 아직 없다 — '판매가 책정 필요'로 표시하고 '설정 필요' 필터에 잡힌다
  base: { doseG: number; cost: number } | null; // 판단 기준 재료비 — ICE·HOT 도징 중간값(레시피 없는 쪽은 기준값 20g·18g)
  buy: { capacityG: number; price: number; vatIncluded: boolean } | null; // 최신 발주 용량·구매가(입력 그대로)
  ice: LedgerSlot | null;
  hot: LedgerSlot | null;
  hasRecipe: boolean; // ICE·HOT 중 하나라도 있으면 기존 카드 펼침 가능
};

type SortKey = 'need' | 'profit' | 'roast' | 'roastNew';
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'need', label: '설정 필요 먼저' },
  { id: 'profit', label: '이익 높은순' },
  { id: 'roast', label: '로스팅 오래된순' },
];

const num = (n: number) => Math.round(n).toLocaleString('ko-KR');
const md = (s: string | null) => (s ? s.slice(5, 10).replace('-', '.') : '');
const needs = (r: LedgerRow) => !r.ice || !r.hot || r.priceNeeded;
// 막대·정렬 기준 — ICE·HOT 평균 도징 재료비
const baseProfit = (r: LedgerRow) => (r.base && r.price != null ? r.price - r.base.cost : null);
const profitOf = (r: LedgerRow, s: LedgerSlot | null) => (s && r.price != null && s.cost != null ? r.price - s.cost : null);


// 펼침 안 블록 — 왼쪽 이름표 + 오른쪽 내용. 블록 사이는 옅은 음영
function Block({ label, first, children }: { label: string; first?: boolean; children: ReactNode }) {
  return (
    <div
      className={`ledger-block ${first ? '' : 'fc-shade-t'}`}
      style={{
        display: 'grid',
        gridTemplateColumns: '84px minmax(0, 1fr)',
        gap: 16,
        paddingTop: first ? 0 : 20,
        marginTop: first ? 0 : 20,
      }}
    >
      <span className="text-caption text-muted-foreground" style={{ paddingTop: 4 }}>{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export default function RecipeLedger({
  rows,
  filters,
  onSetup,
  onSetupBoth,
  onDeleteUnset,
  deleting,
  renderDetail,
  renderOrders,
  renderPricing,
  canEditPrice = false,
  onPriceSaved,
}: {
  rows: LedgerRow[];
  filters?: ReactNode; // 왼쪽 필터 칩(전체·설정 필요·국가) — 정렬 칩과 한 줄에 놓는다
  onSetup: (row: LedgerRow, bt: BrewType) => void;
  onSetupBoth: (row: LedgerRow) => void; // 레시피가 하나도 없는 원두 — HOT 저장 후 ICE 로 이어짐
  onDeleteUnset: (row: LedgerRow) => void; // 레시피 없는 원두의 발주 기록 삭제
  deleting: string | null;
  renderDetail: (beanKey: string) => ReactNode;
  renderOrders?: (beanKey: string) => ReactNode; // 줄 펼침의 '발주 기록'(LedgerOrders) — 넘기면 레시피 없는 원두도 펼쳐진다
  renderPricing?: (beanKey: string) => ReactNode; // 줄 펼침의 '판매가'(LedgerPricing) — 두 지점 가격·재료비율·책정·공유
  canEditPrice?: boolean; // saleprice 탭 권한 — 판매가 칸을 눌러 바로 수정
  onPriceSaved?: (rec: PurchaseRecord) => void;
}) {
  const [sort, setSort] = useState<SortKey>('need');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (k: string) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    });

  // 'need' 는 부모가 넘긴 순서(설정 필요 → 최신 발주) 그대로
  const sorted = useMemo(() => {
    if (sort === 'need') return rows;
    const list = [...rows];
    if (sort === 'profit') list.sort((a, b) => (baseProfit(b) ?? -Infinity) - (baseProfit(a) ?? -Infinity));
    else {
      // 로스팅일 없는 원두는 방향과 상관없이 맨 뒤
      const dir = sort === 'roast' ? 1 : -1; // roast = 오래된순, roastNew = 최신순
      const age = (r: LedgerRow) => r.roast?.days;
      list.sort((a, b) => {
        const x = age(a), y = age(b);
        if (x == null || y == null) return (x == null ? 1 : 0) - (y == null ? 1 : 0);
        return dir * (y - x);
      });
    }
    return list;
  }, [rows, sort]);

  const th = 'text-caption font-normal text-muted-foreground';
  const cell: React.CSSProperties = { padding: '18px 10px', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'left' };
  const COLS = 6;

  // 레시피가 없는 칸 — 「● 레시피 설정 필요」를 누르면 바로 설정(HOT·ICE 둘 다 없으면 HOT → ICE 순서)
  const needRecipe = (row: LedgerRow, bt: BrewType, both: boolean) => (
    <button
      onClick={(e) => {
        e.stopPropagation();
        if (both) onSetupBoth(row);
        else onSetup(row, bt);
      }}
      className="fc-need text-body"
      title={both ? 'HOT 저장 후 ICE 설정으로 이어져요' : `${bt.toUpperCase()} 레시피 설정`}
    >
      레시피 설정 필요
    </button>
  );

  const slotCell = (row: LedgerRow, bt: BrewType) => {
    const s = row[bt];
    if (!s) return needRecipe(row, bt, false);
    return (
      <span>
        {s.ratio ?? '—'}
        {s.fallback && <span className="text-caption text-muted-foreground" style={{ marginLeft: 6 }}>양재천</span>}
      </span>
    );
  };

  // 재료비율 — 잔당 재료비(ICE·HOT 평균 도징) ÷ 판매가(VAT 포함). 금액은 title 과 펼침에서 본다
  const ratioCell = (row: LedgerRow) => {
    const s = row.base;
    if (!s || row.price == null || row.price <= 0) return <span className="text-muted-foreground">—</span>;
    const pct = Math.round((s.cost / row.price) * 100);
    return (
      <span className="text-muted-foreground" title={`재료비 ${num(s.cost)}원(HOT·ICE 평균 ${s.doseG}g) · 이익 ${num(row.price - s.cost)}원`}>
        {pct}%
      </span>
    );
  };

  // 발주 용량·구매가와 1g당 단가 — 구매가는 입력 그대로(VAT 표기 병기), 1g당 = 구매가 ÷ 구매 용량(로스 반영 전)
  const buyLine = (row: LedgerRow) => {
    const b = row.buy;
    if (!b || b.capacityG <= 0 || b.price <= 0) return null;
    return (
      <div>
        발주 {num(b.capacityG)}g · {num(b.price)}원 · 1g당 {(b.price / b.capacityG).toLocaleString('ko-KR', { maximumFractionDigits: 1 })}원
        <span style={{ opacity: 0.7 }}> (VAT {b.vatIncluded ? '포함' : '별도'})</span>
      </div>
    );
  };

  const costLine = (row: LedgerRow, bt: BrewType) => {
    const s = row[bt];
    if (!s || s.cost == null || s.doseG == null) return null;
    const perG = s.cost / s.doseG;
    const profit = profitOf(row, s);
    return (
      <div key={bt} style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span style={{ width: 28, flexShrink: 0 }}>{bt.toUpperCase()}</span>
        <span>
          {num(perG)}원/g × {s.doseG}g = {num(s.cost)}원
          {profit != null && row.price && (
            <>
              {' → 이익 '}
              <span className="text-foreground">{num(profit)}원</span>
              <span className="text-muted-foreground"> · 재료비율 {Math.round((s.cost / row.price) * 100)}%</span>
            </>
          )}
        </span>
      </div>
    );
  };

  return (
    <div className="min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="text-body" style={{ display: 'flex', alignItems: 'center', gap: '8px 18px', flexWrap: 'wrap' }}>
        {filters}
        <span style={{ flex: 1 }} />
        {SORTS.map((s) => {
          // 로스팅 칩은 누를 때마다 오래된순 ↔ 최신순 전환 (2026-11-03)
          const isRoast = s.id === 'roast';
          const on = isRoast ? sort === 'roast' || sort === 'roastNew' : sort === s.id;
          const label = isRoast && sort === 'roastNew' ? '로스팅 최신순' : s.label;
          return (
            <button
              key={s.id}
              onClick={() => setSort(isRoast ? (sort === 'roast' ? 'roastNew' : 'roast') : s.id)}
              title={isRoast ? '누를 때마다 오래된순 ↔ 최신순' : undefined}
              className={`fc-txt ${on ? 'on' : ''}`}
            >
              {label}
              {isRoast && on && <span style={{ marginLeft: 4, opacity: 0.7 }}>⇅</span>}
            </button>
          );
        })}
      </div>

      {/* 좌우 여백은 카드·펼침 면의 그림자가 잘리지 않게 두는 것 */}
      <div className="min-w-0" style={{ overflowX: 'auto', margin: '0 -16px', padding: '0 16px 20px' }}>
        <table className="ledger-table tabular w-full text-body" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th className={th} style={{ ...cell, paddingTop: 4, paddingBottom: 6 }}>원두</th>
              <th className={th} style={{ ...cell, paddingTop: 4, paddingBottom: 6 }}>발주 → 로스팅</th>
              <th className={th} style={{ ...cell, paddingTop: 4, paddingBottom: 6 }}>HOT</th>
              <th className={th} style={{ ...cell, paddingTop: 4, paddingBottom: 6 }}>ICE</th>
              <th className={th} style={{ ...cell, paddingTop: 4, paddingBottom: 6, textAlign: 'right' }}>판매가(원)</th>
              <th className={th} style={{ ...cell, paddingTop: 4, paddingBottom: 6, textAlign: 'right' }} title="잔당 재료비(HOT·ICE 평균 도징) ÷ 판매가(VAT 포함)">재료비율</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isOpen = open.has(row.beanKey);
              const none = !row.ice && !row.hot;
              // 발주 기록 슬롯이 있으면 레시피가 아직 없는 원두(새 발주)도 펼쳐서 수령·발주를 한다
              const canOpen = row.hasRecipe || !!renderOrders;
              return (
                <Fragment key={row.beanKey}>
                  <tr
                    onClick={() => canOpen && toggle(row.beanKey)}
                    className={`lr ${canOpen ? 'cursor-pointer' : ''}`}
                    title={canOpen ? (isOpen ? '접기' : row.hasRecipe ? '펼치기 — 판매가 · 발주 기록 · 레시피(수정 · 이력 · 보관)' : '펼치기 — 판매가 · 발주 기록(수령 · 발주 · 원두카드)') : undefined}
                  >
                    <td className="lc-bean" style={{ ...cell, whiteSpace: 'normal', minWidth: 240 }}>
                      <span className="text-foreground">{row.bean}</span>
                      {canOpen && <span className="text-caption text-muted-foreground" style={{ marginLeft: 6 }}>{isOpen ? '▴' : '▾'}</span>}
                      <br />
                      <span className="text-caption text-muted-foreground">
                        {row.country}
                        {row.roastery ? ` · ${row.roastery}` : ''}
                      </span>
                    </td>
                    {/* 발주 → 로스팅 · D+N 한 칸. 디게싱 중·지남만 상태색 */}
                    <td className="lc-date text-caption text-muted-foreground" style={cell}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {row.orderDate && <span>{md(row.orderDate)}</span>}
                        {row.roast ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title={restTitle(row.roast)}>
                            <span>
                              → {row.roast.estimated ? '~' : ''}
                              {md(row.roast.date)}
                            </span>
                            <span>·</span>
                            <span className={restStage(row.roast.days) === 'peak' ? '' : `rounded-sm ${restClass[restStage(row.roast.days)]}`} style={restStage(row.roast.days) === 'peak' ? undefined : { padding: '1px 6px' }}>
                              D+{row.roast.days}
                              {restStage(row.roast.days) === 'resting' ? ' 디게싱 중' : ''}
                            </span>
                          </span>
                        ) : (
                          <span style={{ opacity: 0.6 }}>· 로스팅일 없음</span>
                        )}
                      </span>
                    </td>
                    {none ? (
                      <td className="lc-span" data-label="레시피" colSpan={2} style={cell}>{needRecipe(row, 'hot', true)}</td>
                    ) : (
                      <>
                        <td data-label="HOT" style={cell}>{slotCell(row, 'hot')}</td>
                        <td data-label="ICE" style={cell}>{slotCell(row, 'ice')}</td>
                      </>
                    )}
                    <td data-label="판매가" style={{ ...cell, textAlign: 'right' }}>
                      {/* 판교 판매가는 양재천 책정가에서 나오는 값 — 수정은 양재천 화면에서만 */}
                      <span title={row.priceNote ? '판매가 수정은 양재천 화면에서' : undefined}>
                        {row.priceNeeded ? (
                          <span className="fc-need text-body">판매가 책정 필요</span>
                        ) : (
                          <LedgerPriceCell
                            purchaseId={row.purchaseId}
                            price={row.price}
                            canEdit={canEditPrice && !!onPriceSaved && !row.priceNote}
                            onSaved={(rec) => onPriceSaved?.(rec)}
                          />
                        )}
                      </span>
                    </td>
                    <td data-label="재료비율" style={{ ...cell, textAlign: 'right' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        {ratioCell(row)}
                        {none && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteUnset(row);
                            }}
                            disabled={deleting === row.beanKey}
                            title="발주 기록 삭제"
                            className="fc-txt text-caption"
                          >
                            삭제
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>

                  {/* 펼침 — 판매가 · 발주 기록 · 레시피 세 블록을 같은 틀(왼쪽 이름표 + 오른쪽 내용)로 (2026-11-24) */}
                  {isOpen && (
                    <tr className="lo">
                      <td className="lc-open" colSpan={COLS} style={{ padding: 0, whiteSpace: 'normal' }}>
                        <div className="fc-open fc-lift text-body">
                        {renderPricing && (
                          <Block label="판매가" first>
                            {renderPricing(row.beanKey)}
                            {/* 원가 계산 — g당 원가 × 레시피 도징 = 잔당 재료비 (보고 있는 지점 판매가 기준) */}
                            {(row.hot?.cost != null || row.ice?.cost != null) && (
                              <div className="text-caption text-muted-foreground" style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12 }}>
                                {costLine(row, 'hot')}
                                {costLine(row, 'ice')}
                                {buyLine(row)}
                              </div>
                            )}
                          </Block>
                        )}
                        {renderOrders && (
                          <Block label="발주 기록" first={!renderPricing}>
                            {renderOrders(row.beanKey)}
                          </Block>
                        )}
                        <Block label="레시피" first={!renderPricing && !renderOrders}>
                          {row.hasRecipe ? (
                            <div style={{ maxWidth: 900 }}>{renderDetail(row.beanKey)}</div>
                          ) : (
                            <span className="text-muted-foreground">
                              아직 레시피가 없어요 — 위 줄의 「레시피 설정 필요」를 누르면 HOT → ICE 순서로 만들어요
                            </span>
                          )}
                        </Block>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
