'use client';

import { useEffect, useState } from 'react';

// 인센 시뮬레이션 (2026-08-23 대표 결정) — 매니저 인센티브의 기준 이익을
//   인센 기준 = 월 손익(지표 EBIT) − 투자 상각(총투자 ÷ 상각 개월수, 정액)
// 으로 계산해 월별·누적으로 보여준다. 감가상각을 정식 도입하는 게 아니라(손익 3형제 무변경),
// "목돈 투자와 월 단위 성과 평가를 화해시키는" 인센 전용 화면이다.
// 개월수·장부 외 투자·요율은 입력으로 바꿔가며 여러 안을 비교한다(브라우저별 localStorage 저장).
//
// 투자 원금 = 장부의 자본적지출(월별, capexByMonth) + 장부 외 초기 투자(수기 — 개점 전
// 개인·타브랜드 계좌 지급분은 장부에 없어서 총액을 대표가 입력해야 한다).

interface SimMonth {
  ym: string;
  ebit: number;
}

const PRESETS = [36, 48, 60, 72, 84];

const addMonths = (ym: string, k: number): string => {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + k;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

const won = (n: number) => Math.round(n).toLocaleString('ko-KR');
const manwon = (n: number) => `${Math.round(n / 10_000).toLocaleString('ko-KR')}만`;

/** 콤마 섞인 금액 입력을 숫자로 — 비우면 0 */
const parseAmount = (s: string): number => {
  const n = Number(s.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export default function IncentiveSim({
  months, // 오름차순(과거→최신) — 누적 계산 방향
  capexOut, // 장부 자본적지출 원금(ym → 원) — 이 단위(브랜드·지점) 필터 완료본
  segId, // 입력 저장 키(단위별로 따로 기억)
  segLabel,
}: {
  months: SimMonth[];
  capexOut: Record<string, number>;
  segId: string;
  segLabel: string;
}) {
  const firstYm = months[0]?.ym ?? '';
  const [nMonths, setNMonths] = useState(60);
  const [extraStr, setExtraStr] = useState(''); // 장부 외 초기 투자(콤마 표기)
  const [extraYm, setExtraYm] = useState(firstYm);
  const [ratePct, setRatePct] = useState(10);

  // 단위별 입력 기억 — 시뮬레이션 파라미터는 개인 브라우저 편의(제도 확정 전이라 DB 저장 안 함)
  const storeKey = `incentive-sim:${segId}`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storeKey) ?? 'null') as {
        n?: number;
        extra?: number;
        extraYm?: string;
        rate?: number;
      } | null;
      if (!saved) return;
      if (saved.n && saved.n > 0) setNMonths(saved.n);
      if (saved.extra && saved.extra > 0) setExtraStr(won(saved.extra));
      if (saved.extraYm && /^\d{4}-\d{2}$/.test(saved.extraYm)) setExtraYm(saved.extraYm);
      if (saved.rate != null && saved.rate >= 0) setRatePct(saved.rate);
    } catch {
      /* localStorage 접근 불가(프라이빗 모드 등) — 기본값으로 진행 */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeKey]);
  const persist = (patch: Partial<{ n: number; extra: number; extraYm: string; rate: number }>) => {
    try {
      const cur = JSON.parse(localStorage.getItem(storeKey) ?? '{}') as Record<string, unknown>;
      localStorage.setItem(storeKey, JSON.stringify({ ...cur, ...patch }));
    } catch {
      /* 저장 실패 무시 */
    }
  };

  const extra = parseAmount(extraStr);
  const ledgerTotal = Object.values(capexOut).reduce((a, b) => a + b, 0);
  const totalInvest = ledgerTotal + extra;

  // 주어진 개월수로 시뮬 한 판 — 프리셋 비교와 본 표가 같은 계산을 쓴다
  const simulate = (n: number) => {
    const dep: Record<string, number> = {};
    const spread = (startYm: string, amount: number) => {
      if (!(amount > 0) || !(n > 0) || !/^\d{4}-\d{2}$/.test(startYm)) return;
      const monthly = amount / n;
      for (let k = 0; k < n; k++) {
        const ym = addMonths(startYm, k);
        dep[ym] = (dep[ym] ?? 0) + monthly;
      }
    };
    for (const [ym, amt] of Object.entries(capexOut)) spread(ym, amt);
    spread(extraYm, extra);
    let cum = 0;
    let incentiveTotal = 0;
    const rows = months.map((m) => {
      const d = Math.round(dep[m.ym] ?? 0);
      const base = m.ebit - d;
      cum += base;
      // 당월 양수분에만 요율 적용 — 적자 달 이월(상계)·누적 흑자 후 지급 같은 규칙은 운영 결정 대기
      const incentive = Math.round(Math.max(0, base) * (ratePct / 100));
      incentiveTotal += incentive;
      return { ym: m.ym, ebit: m.ebit, dep: d, base, cum, incentive };
    });
    return { rows, incentiveTotal, cumEnd: cum };
  };

  // 계산량이 작아(월 수십 × 프리셋 5) 메모 없이 매 렌더 계산 — 훅 의존성 관리보다 단순함이 낫다
  const sim = simulate(nMonths);
  const presetSims = PRESETS.map((n) => ({ n, ...simulate(n) }));

  if (months.length === 0) return null;
  const rowsDesc = [...sim.rows].reverse(); // 표는 최신 월 위로(결산 표와 같은 방향)

  const inputCls =
    'w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-right text-[13px] tabular-nums focus:outline-none focus:ring-1 focus:ring-foreground/30';

  return (
    <section className="rounded-md border border-border p-5">
      <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
        <h2 className="m-0 text-[15px] font-medium">인센 시뮬레이션</h2>
        <span className="text-[12px] text-muted-foreground">
          인센 기준 = 월 손익(EBIT) − 투자 상각(총투자 ÷ 개월수, 정액) — 개월수를 바꿔가며 안을 비교해요.
        </span>
      </div>
      <p className="mb-4 mt-0 text-[12px] leading-relaxed text-muted-foreground">
        {segLabel}의 장부 자본적지출 <b className="text-foreground">{won(ledgerTotal)}원</b>
        {extra > 0 && (
          <>
            {' '}
            + 장부 외 투자 <b className="text-foreground">{won(extra)}원</b>
          </>
        )}{' '}
        = 총투자 <b className="text-foreground">{won(totalInvest)}원</b>을 {nMonths}개월 정액 상각(월{' '}
        {won(totalInvest / Math.max(1, nMonths))}원). 개점 전 개인·타브랜드 계좌로 낸 투자는 장부에 없으니 '장부 외
        투자'에 넣어주세요. 손익에 아직 없는 고정비(예: 임대료)가 있으면 기준이 그만큼 부풀어요 — 관리손익·EBIT
        자체는 이 화면과 무관하게 그대로예요.
      </p>

      {/* 입력 줄 — 상각 개월수 · 장부 외 투자(금액+시작월) · 인센율 */}
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted-foreground">상각 개월수</span>
          <input
            type="number"
            min={1}
            max={240}
            value={nMonths}
            onChange={(e) => {
              const v = Math.max(1, Math.min(240, Number(e.target.value) || 0));
              setNMonths(v);
              persist({ n: v });
            }}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted-foreground">장부 외 초기 투자(원)</span>
          <input
            type="text"
            inputMode="numeric"
            placeholder="예: 165,000,000"
            value={extraStr}
            onChange={(e) => {
              const n = parseAmount(e.target.value);
              setExtraStr(n > 0 ? won(n) : '');
              persist({ extra: n });
            }}
            className={inputCls}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted-foreground">장부 외 투자 귀속 시작월</span>
          <select
            value={extraYm}
            onChange={(e) => {
              setExtraYm(e.target.value);
              persist({ extraYm: e.target.value });
            }}
            className={`${inputCls} text-left`}
          >
            {months.map((m) => (
              <option key={m.ym} value={m.ym}>
                {m.ym}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] text-muted-foreground">인센율 %</span>
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

      {/* 프리셋 비교 — 누르면 그 개월수로 본 표가 바뀐다 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {presetSims.map((p) => (
          <button
            key={p.n}
            type="button"
            onClick={() => {
              setNMonths(p.n);
              persist({ n: p.n });
            }}
            className={`rounded-md border px-3 py-1.5 text-[12px] tabular-nums transition-colors ${
              p.n === nMonths
                ? 'border-foreground/60 bg-muted/60 text-foreground'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
            title={`총투자 ÷ ${p.n}개월 = 월 상각 ${won(totalInvest / p.n)}원`}
          >
            {p.n}개월 · 월 상각 {manwon(totalInvest / p.n)} · 인센 합 {manwon(p.incentiveTotal)}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="whitespace-nowrap px-3 py-2 text-left font-normal">월</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-normal">월 손익(EBIT)</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-normal">투자 상각</th>
              <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-foreground">인센 기준</th>
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
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums">{won(r.ebit)}</td>
                <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                  {r.dep === 0 ? '' : `−${won(r.dep)}`}
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
            <tr className="border-t border-border text-[13px]">
              <td className="px-3 py-2 font-medium">합계</td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                {won(sim.rows.reduce((a, r) => a + r.ebit, 0))}
              </td>
              <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                −{won(sim.rows.reduce((a, r) => a + r.dep, 0))}
              </td>
              <td className={`px-3 py-2 text-right font-medium tabular-nums ${sim.cumEnd < 0 ? 'text-destructive' : ''}`}>
                {sim.cumEnd < 0 ? `−${won(-sim.cumEnd)}` : won(sim.cumEnd)}
              </td>
              <td className="px-3 py-2" />
              <td className="px-3 py-2 text-right font-medium tabular-nums">{won(sim.incentiveTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mb-0 mt-3 text-[11px] leading-relaxed text-muted-foreground">
        * 인센은 <b>당월 기준이 양수인 달</b>에만 요율을 적용한 시뮬레이션 값이에요 — 적자 달을 다음 달과 상계(이월)할지,
        누적 기준이 흑자로 돌아선 뒤부터 지급할지는 제도 확정 때 정해요. 진행 중인 달은 차트와 같은 규칙으로 제외돼요.
        입력값은 이 브라우저에만 저장돼요(제도 확정 전 시뮬레이션 용도).
      </p>
    </section>
  );
}
