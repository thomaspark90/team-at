'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import type { BrewType } from '@/lib/types';
import { restClass, restStage, restTitle, type RoastInfo } from '@/lib/garden/roast';
import { brewOnStyle } from '@/lib/garden/brew-colors';
import LedgerPriceCell from '@/components/garden/LedgerPriceCell';
import type { PurchaseRecord } from '@/lib/types';

// 필터 레시피 목록(2026-11-03 대표 결정: 시안 C3 '인덱스 + 펼침').
// 한 원두 = 한 줄 인덱스 — 날짜는 발주 → 로스팅 → D+N 흐름, ICE·HOT 은 비율(없으면 '레시피 설정 필요'),
// 이익은 재료비/이익 막대(ICE·HOT 평균 도징 기준, 2026-11-03 — 이전엔 HOT 우선). 줄을 누르면 원가 계산 + 기존 카드(타이머·수정·이력·보관)가 펼쳐진다.
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
  price: number | null; // 책정 판매가(원, VAT 포함 소비자가)
  purchaseId: string | null; // 판매가가 저장된 최신 발주 기록 — 판매가 칸 인라인 수정 대상
  base: { doseG: number; cost: number } | null; // 판단 기준 재료비 — ICE·HOT 도징 중간값(레시피 없는 쪽은 프리셋 22g·18g)
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
const needs = (r: LedgerRow) => !r.ice || !r.hot;
// 막대·정렬 기준 — ICE·HOT 평균 도징 재료비
const baseProfit = (r: LedgerRow) => (r.base && r.price != null ? r.price - r.base.cost : null);
const profitOf = (r: LedgerRow, s: LedgerSlot | null) => (s && r.price != null && s.cost != null ? r.price - s.cost : null);


function NeedBadge() {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/15 text-caption font-medium text-amber-700 dark:text-amber-400"
      style={{ padding: '2px 9px', whiteSpace: 'nowrap' }}
    >
      <span className="rounded-full bg-amber-500" style={{ width: 5, height: 5 }} />
      레시피 설정 필요
    </span>
  );
}

function Brew({ bt }: { bt: BrewType }) {
  return (
    <span className="rounded-sm text-caption font-medium" style={{ padding: '1px 6px', letterSpacing: '0.05em', ...brewOnStyle(bt) }}>
      {bt.toUpperCase()}
    </span>
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
  canEditPrice = false,
  onPriceSaved,
}: {
  rows: LedgerRow[];
  filters?: ReactNode; // 왼쪽 필터 칩(전체·설정 필요·국가) — 정렬 칩과 한 줄에 놓는다
  onSetup: (row: LedgerRow, bt: BrewType) => void;
  onSetupBoth: (row: LedgerRow) => void; // 레시피가 하나도 없는 원두 — ICE 저장 후 HOT 로 이어짐
  onDeleteUnset: (row: LedgerRow) => void; // 레시피 없는 원두의 발주 기록 삭제
  deleting: string | null;
  renderDetail: (beanKey: string) => ReactNode;
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
  const cell: React.CSSProperties = { padding: '12px 10px', whiteSpace: 'nowrap', verticalAlign: 'middle', textAlign: 'left' };
  const COLS = 6;

  const slotCell = (row: LedgerRow, bt: BrewType) => {
    const s = row[bt];
    if (s)
      return (
        <span>
          {s.ratio ?? '—'}
          {s.fallback && <span className="text-caption text-muted-foreground" style={{ marginLeft: 6 }}>양재천</span>}
        </span>
      );
    const none = !row.ice && !row.hot;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <NeedBadge />
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (none && bt === 'ice') onSetupBoth(row);
            else onSetup(row, bt);
          }}
          className="ta-btn"
          style={{ height: 26, paddingLeft: 10, paddingRight: 10, fontSize: 12 }}
          title={none && bt === 'ice' ? 'ICE 저장 후 HOT 설정으로 이어져요' : undefined}
        >
          설정
        </button>
      </span>
    );
  };

  const marginBar = (row: LedgerRow) => {
    const s = row.base;
    if (!s || row.price == null) return <span className="text-muted-foreground">—</span>;
    const pct = Math.min(100, Math.max(0, Math.round((s.cost / row.price) * 100)));
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }} title={`재료비 ${num(s.cost)}원(HOT·ICE 평균 ${s.doseG}g) · 재료비율 ${pct}%`}>
        <span className="rounded-sm bg-muted" style={{ display: 'flex', width: 120, height: 8, overflow: 'hidden' }}>
          <span className="bg-muted-foreground/40" style={{ width: `${pct}%` }} />
          <span className="bg-emerald-600/60" style={{ width: `${100 - pct}%` }} />
        </span>
        <span className="text-emerald-700 dark:text-emerald-400">{num(row.price - s.cost)}</span>
        {/* 재료비율 — 잔당 재료비 ÷ 판매가(VAT 포함) */}
        <span className="text-muted-foreground">재료비 {pct}%</span>
      </span>
    );
  };

  // 발주 용량·구매가와 1g당 단가 — 구매가는 입력 그대로(VAT 표기 병기), 1g당 = 구매가 ÷ 구매 용량(로스 반영 전)
  const buyLine = (row: LedgerRow) => {
    const b = row.buy;
    if (!b || b.capacityG <= 0 || b.price <= 0) return null;
    return (
      <div className="text-caption text-muted-foreground" style={{ marginTop: 4 }}>
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
        <Brew bt={bt} />
        <span>
          {num(perG)}원/g × {s.doseG}g = {num(s.cost)}원
          {profit != null && row.price && (
            <>
              {' → 이익 '}
              <span className="text-emerald-700 dark:text-emerald-400">{num(profit)}원</span>
              <span className="text-muted-foreground"> · 재료비율 {Math.round((s.cost / row.price) * 100)}%</span>
            </>
          )}
        </span>
      </div>
    );
  };

  return (
    <div className="min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
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
              className={`rounded-md border px-2.5 py-1 text-body transition-colors ${
                on ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
              {isRoast && on && <span style={{ marginLeft: 4, opacity: 0.7 }}>⇅</span>}
            </button>
          );
        })}
      </div>

      <div className="min-w-0" style={{ overflowX: 'auto' }}>
        <table className="tabular w-full text-body" style={{ borderCollapse: 'collapse', minWidth: 900 }}>
          <thead>
            <tr className="border-b border-border">
              <th className={th} style={cell}>원두</th>
              <th className={th} style={cell}>날짜</th>
              <th className={th} style={cell}>HOT</th>
              <th className={th} style={cell}>ICE</th>
              <th className={th} style={{ ...cell, textAlign: 'right' }}>판매가(원)</th>
              <th className={th} style={cell}>재료비 / 이익(원) · 재료비율 — HOT·ICE 평균 도징 기준</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const isOpen = open.has(row.beanKey);
              const none = !row.ice && !row.hot;
              return (
                <Fragment key={row.beanKey}>
                  <tr
                    onClick={() => row.hasRecipe && toggle(row.beanKey)}
                    className={`border-b border-border ${needs(row) ? 'bg-amber-500/[0.04]' : ''} ${row.hasRecipe ? 'cursor-pointer hover:bg-muted/40' : ''}`}
                    title={row.hasRecipe ? (isOpen ? '접기' : '펼치기 — 원가 계산 · 타이머 · 수정 · 이력 · 보관') : undefined}
                  >
                    <td style={{ ...cell, whiteSpace: 'normal', minWidth: 220 }}>
                      <span className="text-foreground">{row.bean}</span>
                      {row.hasRecipe && <span className="text-caption text-muted-foreground" style={{ marginLeft: 6 }}>{isOpen ? '▴' : '▾'}</span>}
                      <br />
                      <span className="text-caption text-muted-foreground">
                        {row.country}
                        {row.roastery ? ` · ${row.roastery}` : ''}
                      </span>
                    </td>
                    <td className="text-caption text-muted-foreground" style={cell}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        {row.orderDate && <span>발주 {md(row.orderDate)}</span>}
                        <span className="bg-border" style={{ width: 16, height: 1 }} />
                        {row.roast ? (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} title={restTitle(row.roast)}>
                            <span>
                              로스팅 {row.roast.estimated ? '~' : ''}
                              {md(row.roast.date)}
                              {row.roast.estimated && <span style={{ opacity: 0.7 }}> 추정</span>}
                            </span>
                            <span className="bg-border" style={{ width: 16, height: 1 }} />
                            <span className={`rounded-sm ${restClass[restStage(row.roast.days)]}`} style={{ padding: '1px 6px' }}>
                              D+{row.roast.days}
                              {restStage(row.roast.days) === 'resting' ? ' 디게싱 중' : ''}
                            </span>
                          </span>
                        ) : (
                          <span style={{ opacity: 0.6 }}>로스팅일 없음</span>
                        )}
                      </span>
                    </td>
                    <td style={cell}>{slotCell(row, 'hot')}</td>
                    <td style={cell}>{slotCell(row, 'ice')}</td>
                    <td style={{ ...cell, textAlign: 'right' }}>
                      <LedgerPriceCell
                        purchaseId={row.purchaseId}
                        price={row.price}
                        canEdit={canEditPrice && !!onPriceSaved}
                        onSaved={(rec) => onPriceSaved?.(rec)}
                      />
                    </td>
                    <td style={cell}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                        {marginBar(row)}
                        {none && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteUnset(row);
                            }}
                            disabled={deleting === row.beanKey}
                            title="발주 기록 삭제"
                            className="text-muted-foreground hover:text-foreground"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
                          >
                            ×
                          </button>
                        )}
                      </span>
                      {buyLine(row)}
                    </td>
                  </tr>

                  {/* 펼침 — 원가 계산 + 기존 카드 그대로(타이머·수정·삭제·이력·대기·보관) */}
                  {isOpen && (
                    <tr className="border-b border-border bg-muted/30">
                      <td colSpan={COLS} style={{ padding: '16px 20px 22px', whiteSpace: 'normal' }}>
                        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
                          <div style={{ width: 840, maxWidth: '100%' }}>{renderDetail(row.beanKey)}</div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 280 }}>
                            <p className="text-body font-medium" style={{ margin: 0 }}>원가 계산</p>
                            <p className="text-body text-muted-foreground" style={{ margin: 0 }}>
                              판매가 {row.price != null ? `${num(row.price)}원` : '미책정'}
                              <span className="text-caption"> (VAT 포함 소비자가)</span>
                            </p>
                            {costLine(row, 'hot')}
                            {costLine(row, 'ice')}
                          </div>
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
