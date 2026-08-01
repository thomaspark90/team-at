'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { KNOWN_BANKS } from '@/lib/finance/brandBanks';
import { BRANDS } from '@/lib/finance/types';

export interface BrandBankRow {
  brand: string;
  banks: string[];
}

// 브랜드별 사용 은행 설정 — 설정 페이지(/finance/categories)의 한 섹션.
// 여기서 끈 은행은 그 브랜드의 업로드 보드·월확정 게이트·월 배지에서 요구하지 않는다.
// '개인'은 자료 입력 단위가 아니라 노출하지 않는다(사업 브랜드만).
export default function BrandBankSettings({ initial }: { initial: BrandBankRow[] }) {
  // 행이 없는 브랜드는 전체 은행 사용으로 표시(서버 폴백과 동일 규칙)
  const [rows, setRows] = useState<Record<string, string[]>>(() => {
    const m: Record<string, string[]> = {};
    for (const b of BRANDS)
      m[b.id] = initial.find((r) => r.brand === b.id)?.banks ?? KNOWN_BANKS.map((k) => k.value);
    return m;
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(brand: string, bank: string) {
    const cur = rows[brand] ?? [];
    const on = cur.includes(bank);
    // KNOWN_BANKS 순서 유지로 재구성
    const next = KNOWN_BANKS.map((k) => k.value).filter((v) => (v === bank ? !on : cur.includes(v)));
    if (next.length === 0) {
      setError('은행을 최소 1개는 남겨야 해요.');
      return;
    }
    setBusy(brand);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase
      .schema('finance')
      .from('brand_settings')
      .upsert({ brand, banks: next, updated_at: new Date().toISOString() });
    if (error) {
      setError(
        /brand_settings/.test(error.message)
          ? '설정 테이블이 아직 없어요. 관리자가 supabase/migration_brand_settings.sql 을 실행해야 해요.'
          : error.message
      );
    } else {
      setRows((m) => ({ ...m, [brand]: next }));
    }
    setBusy(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-[13px] text-muted-foreground">
        브랜드가 실제로 쓰는 은행만 켜두세요. 꺼진 은행은 그 브랜드의 <b>자료 입력 보드·월 확정 점검·월 배지</b>에서
        요구하지 않아요. (은행을 새로 추가하는 기능이 아니라, 파서가 준비된 은행 중 사용 여부를 고르는 거예요.)
      </p>
      {error && <div className="text-[13px] text-destructive">⚠️ {error}</div>}
      <div className="overflow-hidden rounded-md border border-border bg-background">
        {BRANDS.map((b, i) => (
          <div
            key={b.id}
            className={`flex flex-wrap items-center gap-[10px] px-[14px] py-[10px] ${i > 0 ? 'border-t border-border' : ''}`}
          >
            <span className="flex-[1_1_140px] text-[13px] text-foreground">{b.label}</span>
            {KNOWN_BANKS.map((k) => {
              const on = (rows[b.id] ?? []).includes(k.value);
              return (
                <button
                  key={k.value}
                  onClick={() => toggle(b.id, k.value)}
                  disabled={busy === b.id}
                  className={`whitespace-nowrap rounded-md border px-3 py-1 text-[11px] ${
                    on ? 'border-transparent bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
                  }`}
                >
                  {on ? '✓ ' : ''}
                  {k.label}
                </button>
              );
            })}
            {busy === b.id && <span className="text-[11px] text-muted-foreground">저장 중…</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
