'use client';

import { useEffect, useState } from 'react';

// 인센 시뮬레이션 (2026-09-11 대표 결정, 상각식 폐지) — 매니저 인센티브의 기준 이익을
//   인센 기준 = 월 손익(지표 EBIT) × 배분율(기본 20%)
//   인센     = 인센 기준(양수인 달만) × 인센율(기본 10%)
// 으로 계산해 월별·누적으로 보여준다. 순수익의 80%는 투자 회수·회사 몫으로 제외하고 남는 20%가
// 인센의 모수다. 투자 상각 차감은 하지 않는다(2026-08-23 상각식은 이 결정으로 대체).
// 손익 3형제(지표 EBIT·월 결산·관리손익) 산식은 무변경 — 이 카드만의 파생 계산이다.
// 배분율·인센율은 입력으로 바꿔가며 여러 안을 비교한다(브라우저별 localStorage 저장).

interface SimMonth {
  ym: string;
  ebit: number;
}

const won = (n: number) => Math.round(n).toLocaleString('ko-KR');

export default function IncentiveSim({
  months, // 오름차순(과거→최신) — 누적 계산 방향
  segId, // 입력 저장 키(단위별로 따로 기억)
  segLabel,
}: {
  months: SimMonth[];
  segId: string;
  segLabel: string;
}) {
  const [sharePct, setSharePct] = useState(20); // 순수익 중 인센 모수로 남기는 비율
  const [ratePct, setRatePct] = useState(10); // 모수에 적용하는 인센율

  // 단위별 입력 기억 — 시뮬레이션 파라미터는 개인 브라우저 편의(제도 확정 전이라 DB 저장 안 함)
  const storeKey = `incentive-sim:${segId}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) ?? 'null') as {
        share?: number;
        rate?: number;
      } | null;
      if (!saved) return;
      if (saved.share != null && saved.share >= 0) setSharePct(saved.share);
      if (saved.rate != null && saved.rate >= 0) setRatePct(saved.rate);
    } catch {
      /* localStorage 접근 불가(프라이빗 모드 등) — 기본값으로 진행 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);
  const persist = (patch: Partial<{ share: number; rate: number }>) => {
    try {
      const cur = JSON.parse(localStorage.getItem(storeKey) ?? '{}') as Record<string, unknown>;
      localStorage.setItem(storeKey, JSON.stringify({ ...cur, ...patch }));
    } catch {
      /* 저장 실패 무시 */
    }
  };

  // 계산량이 작아(월 수십 개) 메모 없이 매 렌더 계산
  let cum = 0;
  let incentiveTotal = 0;
  const rows = months.map((m) => {
    const base = Math.round(m.ebit * (sharePct / 100));
    cum += base;
    // 당월 양수분에만 요율 적용 — 적자 달 이월(상계)·누적 흑자 후 지급 같은 규칙은 운영 결정 대기
    const incentive = Math.round(Math.max(0, base) * (ratePct / 100));
    incentiveTotal += incentive;
    return { ym: m.ym, ebit: m.ebit, base, cum, incentive };
  });
  const ebitTotal = rows.reduce((a, r) => a + r.ebit, 0);

  if (months.length === 0) return null;
  const rowsDesc = [...rows].reverse(); // 표는 최신 월 위로(결산 표와 같은 방향)

  const inputCls =
    'w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-right text-body tabular-nums focus:outline-none focus:ring-1 focus:ring-foreground/30';

  return (
    <section className="rounded-md border border-border p-5">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
        <h2 className="m-0 text-title font-medium">인센 시뮬레이션</h2>
        <span className="text-caption text-muted-foreground">
          인센 기준 = 월 손익(EBIT) × 배분율 — 순수익의 {100 - sharePct}%는 제외하고 남는 {sharePct}%가 인센 모수예요.
        </span>
      </div>
      <p className="mb-4 mt-0 text-caption leading-relaxed text-muted-foreground">
        {segLabel}의 월 손익(EBIT)에서 <b className="text-foreground">{sharePct}%</b>만 남긴 금액이 인센 기준이고, 그
        기준이 양수인 달에 인센율 <b className="text-foreground">{ratePct}%</b>를 곱해요. 투자 상각은 차감하지 않아요.
        손익에 아직 없는 고정비(예: 임대료)가 있으면 기준이 그만큼 부풀어요 — 관리손익·EBIT 자체는 이 화면과 무관하게
        그대로예요.
      </p>

      {/* 입력 줄 — 배분율 · 인센율 */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:max-w-sm">
        <label className="block">
          <span className="mb-1 block text-caption text-muted-foreground">배분율 % (순수익 중 인센 모수)</span>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={sharePct}
            onChange={(e) => {
              const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
              setSharePct(v);
              persist({ share: v });
            }}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-caption text-muted-foreground">인센율 %</span>
          <input
            type="number"
            min={0}
            max={100}
            step={0.5}
            value={ratePct}
            onChange={(e) => {
              const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
              setRatePct(v);
              persist({ rate: v });
            }}
            className={inputCls}
          />
        </label>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-body">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="whitespace-nowrap px-3 py-2 text-left font-normal">월</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-normal">월 손익(EBIT)</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-foreground">
                인센 기준 ({sharePct}%)
              </th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-normal">누적 기준</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-foreground">
                인센 ({ratePct}%)
              </th>
            </tr>
          </thead>
          <tbody>
            {rowsDesc.map((r) => (
              <tr key={r.ym} className="border-b border-border/50 last:border-0">
                <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-muted-foreground">{r.ym}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                  {r.ebit < 0 ? `−${won(-r.ebit)}` : won(r.ebit)}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums ${
                    r.base < 0 ? 'text-destructive' : ''
                  }`}
                >
                  {r.base < 0 ? `−${won(-r.base)}` : won(r.base)}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-1.5 text-right tabular-nums ${
                    r.cum < 0 ? 'text-destructive' : 'text-muted-foreground'
                  }`}
                >
                  {r.cum < 0 ? `−${won(-r.cum)}` : won(r.cum)}
                </td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">
                  {r.incentive === 0 ? '' : won(r.incentive)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-border text-body">
              <td className="px-3 py-2 font-medium">합계</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {ebitTotal < 0 ? `−${won(-ebitTotal)}` : won(ebitTotal)}
              </td>
              <td className={`px-3 py-2 text-right font-medium tabular-nums ${cum < 0 ? 'text-destructive' : ''}`}>
                {cum < 0 ? `−${won(-cum)}` : won(cum)}
              </td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right font-medium tabular-nums">{won(incentiveTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mb-0 mt-3 text-caption leading-relaxed text-muted-foreground">
        * 인센은 <b>당월 기준이 양수인 달</b>에만 요율을 적용한 시뮬레이션 값이에요 — 적자 달을 다음 달과 상계(이월)할지,
        누적 기준이 흑자로 돌아선 뒤부터 지급할지는 제도 확정 때 정해요. 진행 중인 달은 차트와 같은 규칙으로 제외돼요.
        입력값은 이 브라우저에만 저장돼요(제도 확정 전 시뮬레이션 용도).
      </p>
    </section>
  );
}
