'use client';

import { Fragment, useEffect, useState } from 'react';
import type { StoreBeanUsage } from '@/lib/garden/bean-usage';

// 원두 일 사용량 스트립 — 작업 보드 제목 아래, 날씨 한 줄 바로 밑(2026-09-13 대표 지시).
// 발주가 1kg 단위라 kg/일로만 보여준다. 산식·전제는 lib/garden/bean-usage 주석이 정본.
// 참고 줄이라 데이터가 없거나(재무 역할 없음·판교) 조회 실패면 조용히 생략한다.

const STORE_LABEL: Record<string, string> = { pangyo: '판교', yangjae: '양재천' };
const BEAN_SHORT: Record<string, string> = { '스테이(메인)': '스테이', '라이트(시즈널)': '라이트', 디카페인: '디카페인' };
const md = (ymd: string) => ymd.slice(5).replace('-', '.');

// alignEnd: 오른쪽 정렬 — 가든 홈 머리줄(2026-11-20 대표 지시). 원두마다 한 줄, 산출 기준은 제목을 눌러야 보인다.
export default function BeanUsageStrip({ alignEnd = false }: { alignEnd?: boolean }) {
  const [stores, setStores] = useState<StoreBeanUsage[] | null>(null);
  const [openStore, setOpenStore] = useState<string | null>(null); // 산출 기준을 펼친 지점

  useEffect(() => {
    fetch('/api/garden-bean-usage', { cache: 'no-store' })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `조회 실패 (${r.status})`);
        setStores(j.stores ?? []);
      })
      .catch(() => setStores([]));
  }, []);

  if (!stores || stores.length === 0) return null;

  return (
    <div className="mt-3 space-y-3">
      {stores.map((s) => {
        const open = openStore === s.store;
        return (
          <div key={s.store} className={`flex flex-col gap-1 text-body ${alignEnd ? 'items-end text-right' : 'items-start'}`}>
            {/* 제목을 누르면 산출 기준 한 줄이 열린다 — 평소엔 숨김(2026-11-20 대표 지시) */}
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpenStore(open ? null : s.store)}
              className="text-muted-foreground hover:text-foreground"
              style={{ background: 'none', border: 0, padding: 0, font: 'inherit', cursor: 'pointer' }}
            >
              원두 사용량 · {STORE_LABEL[s.store] ?? s.store} <span className="text-caption">{open ? '기준 접기' : '기준 ›'}</span>
            </button>
            {/* 원두마다 한 줄 — 이름·주중·주말 세 칸을 맞춰 세로로 읽히게 */}
            <div className="tabular grid grid-cols-[auto_auto_auto] gap-x-4 gap-y-1 whitespace-nowrap">
              {s.beans.map((b) => (
                <Fragment key={b.bean}>
                  <span className="text-foreground">{BEAN_SHORT[b.bean] ?? b.bean}</span>
                  <span>
                    <span className="text-muted-foreground">주중</span> {b.weekday.kgPerDay.toFixed(1)}kg
                  </span>
                  <span>
                    <span className="text-muted-foreground">주말</span> {b.weekend.kgPerDay.toFixed(1)}kg
                  </span>
                </Fragment>
              ))}
            </div>
            {open && (
              <span className="text-caption text-muted-foreground/70">
                하루 기준 · {md(s.from)}~{md(s.to)} 4주 POS 잔수 · 1샷 {s.doseG}g · 로스 {Math.round(s.lossRate * 100)}% · 주말=토·일·공휴일
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
