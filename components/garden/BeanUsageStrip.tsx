'use client';

import { useEffect, useState } from 'react';
import type { StoreBeanUsage } from '@/lib/garden/bean-usage';

// 원두 일 사용량 스트립 — 작업 보드 제목 아래, 날씨 한 줄 바로 밑(2026-09-13 대표 지시).
// 발주가 1kg 단위라 kg/일로만 보여준다. 산식·전제는 lib/garden/bean-usage 주석이 정본.
// 참고 줄이라 데이터가 없거나(재무 역할 없음·판교) 조회 실패면 조용히 생략한다.

const STORE_LABEL: Record<string, string> = { pangyo: '판교', yangjae: '양재천' };
const BEAN_SHORT: Record<string, string> = { '스테이(메인)': '스테이', '라이트(시즈널)': '라이트', 디카페인: '디카페인' };
const md = (ymd: string) => ymd.slice(5).replace('-', '.');

export default function BeanUsageStrip() {
  const [stores, setStores] = useState<StoreBeanUsage[] | null>(null);

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
    <div className="mt-2 space-y-1">
      {stores.map((s) => (
        <div key={s.store} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-body">
          <span className="text-muted-foreground">원두 사용량 · {STORE_LABEL[s.store] ?? s.store}</span>
          {s.beans.map((b) => (
            <span key={b.bean} className="tabular whitespace-nowrap">
              <span className="text-foreground">{BEAN_SHORT[b.bean] ?? b.bean}</span>{' '}
              <span className="text-muted-foreground">주중</span> {b.weekday.kgPerDay.toFixed(1)}kg{' '}
              <span className="text-muted-foreground">주말</span> {b.weekend.kgPerDay.toFixed(1)}kg
            </span>
          ))}
          <span className="text-caption text-muted-foreground/70">
            하루 기준 · {md(s.from)}~{md(s.to)} 4주 POS 잔수 · 1샷 {s.doseG}g · 로스 {Math.round(s.lossRate * 100)}% · 주말=토·일·공휴일
          </span>
        </div>
      ))}
    </div>
  );
}
