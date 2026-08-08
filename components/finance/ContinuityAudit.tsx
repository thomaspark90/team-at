'use client';

import { useState } from 'react';
import type { Brand } from '@/lib/finance/types';
import { useMonthCtx } from './MonthShell';

// 전체 기간 잔액 연속성 감사 — 저장된 은행 거래 전체의 잔액 체인을 검사해
// '파일 하나 통째 누락' 같은 빠진 구간을 찾는다. 자료 입력 페이지 매트릭스 아래 배치.
// 끊긴 지점 클릭 = 그 달로 이동(빠진 파일을 그 달 칸에서 이어 올리게).

interface Break {
  from: string;
  to: string;
  expected: number;
  actual: number;
}
interface BankResult {
  bank: string;
  label: string;
  rows: number;
  checked: number;
  breaks: Break[];
  reliable: boolean;
}

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');

export default function ContinuityAudit({ brand }: { brand: Brand }) {
  const ctx = useMonthCtx();
  const [results, setResults] = useState<BankResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/finance/audit/continuity?brand=${brand}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '검사에 실패했어요.');
      setResults(j.results as BankResult[]);
    } catch (e) {
      setError((e as Error).message);
      setResults(null);
    }
    setLoading(false);
  }

  const goMonth = (date: string) => {
    ctx?.setYm(date.slice(0, 7));
    requestAnimationFrame(() =>
      document.getElementById('monthly-board')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
  };

  return (
    <details>
      <summary className="cursor-pointer select-none list-none text-[15px] font-medium [&::-webkit-details-marker]:hidden">
        잔액 연속성 감사
        <span className="ml-2 text-[13px] font-normal text-muted-foreground">
          — 저장된 전체 기간에서 빠진 구간(누락 파일) 찾기
        </span>
      </summary>
      <p className="mb-3 mt-1 text-[13px] text-muted-foreground">
        은행 거래의 잔액 흐름(이전 잔액 + 입금 − 출금 = 현재 잔액)이 전 기간 이어지는지 검사해요.
        끊긴 곳 = 그 사이 기간의 거래가 빠졌다는 신호예요(예: 파일 하나를 안 올림). 끊긴 지점을 누르면 그 달로 이동해요.
      </p>

      <button onClick={run} disabled={loading} className="ta-btn-primary text-[13px]">
        {loading ? '검사 중…' : results ? '다시 검사' : '전체 기간 검사'}
      </button>
      {error && <p className="mt-2 text-[13px] text-red-500">⚠ {error}</p>}

      {results && (
        <div className="mt-4 flex flex-col gap-3">
          {results.map((r) => (
            <div key={r.bank} className="rounded-md bg-muted/40 p-3">
              <div className="text-[13px] font-medium">
                {r.label}
                <span className="ml-2 font-normal text-muted-foreground">
                  거래 {r.rows.toLocaleString('ko-KR')}건 · 연결 {r.checked.toLocaleString('ko-KR')}곳 검사
                </span>
              </div>
              {r.rows === 0 ? (
                <p className="mb-0 mt-1 text-[13px] text-muted-foreground">저장된 거래가 없어요.</p>
              ) : !r.reliable ? (
                <p className="mb-0 mt-1 text-[13px] text-muted-foreground">
                  끊김이 너무 많아 판정하지 못했어요 — 여러 계좌가 섞였거나, 시간 정보가 없는 파일이라 같은 날
                  거래의 순서가 뒤섞였을 수 있어요.
                </p>
              ) : r.breaks.length === 0 ? (
                <p className="mb-0 mt-1 text-[13px] text-emerald-600">✓ 전 기간 잔액이 이어져요 — 누락 구간 없음</p>
              ) : (
                <ul className="mb-0 mt-2 flex list-none flex-col gap-1.5 p-0">
                  {r.breaks.map((b, i) => (
                    <li key={i}>
                      <button
                        onClick={() => goMonth(b.from)}
                        className="w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-[13px] transition-colors hover:border-amber-600"
                      >
                        ⚠ <b>{b.from} → {b.to}</b> 사이 누락 의심 — 예상 잔액 {won(b.expected)} vs 실제{' '}
                        {won(b.actual)} (차이 {won(b.actual - b.expected)})
                      </button>
                    </li>
                  ))}
                  {r.breaks.length >= 100 && (
                    <li className="text-[13px] text-muted-foreground">… 끊김이 100곳을 넘어 이하 생략</li>
                  )}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </details>
  );
}
