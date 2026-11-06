import type { ReactNode } from 'react';
import { THEORY_SOURCES, cupSummary } from '@/lib/garden/extraction-theory';
import TheoryCite from './TheoryCite';

const th = 'px-3 py-1.5 text-left text-caption font-normal tracking-[0.04em] text-muted-foreground';
const td = 'border-t border-border px-3 py-1.5 align-top text-body';

// 맛별 곡선의 근거. 측정이 없는 칸은 없다고 적는다.
const ATTRIBUTES: { name: string; shape: ReactNode; roast: ReactNode; basis: string }[] = [
  {
    name: '산미',
    shape: <>초반에 높고 빠르게 줄어든다.<TheoryCite ids={['gloess', 'gagne']} /></>,
    roast: <>배전이 강할수록 낮아진다.<TheoryCite ids={['carcea', 'shi']} /></>,
    basis: '해석(구간별 산 측정 없음)',
  },
  {
    name: '향미',
    shape: <>10~20초에 정점. 무거운 성분일수록 늦고 오래간다.<TheoryCite ids={['sanchez']} /></>,
    roast: <>중간 배전에서 가장 높았다.<TheoryCite ids={['hu']} /></>,
    basis: '측정(향 성분 신호)',
  },
  {
    name: '단맛',
    shape: <>당 곡선이 아니라, 쓴맛과 농도가 줄며 드러나는 균형.<TheoryCite ids={['bartelak', 'batali']} /></>,
    roast: <>강배전에서 당은 사라지지만 단맛 인상과는 별개다.<TheoryCite ids={['hu']} /></>,
    basis: '해석(드립 연구 기반)',
  },
  {
    name: '바디',
    shape: <>초반에 급격히 줄어든다.<TheoryCite ids={['schmieder', 'gloess', 'colloid']} /></>,
    roast: <>배전이 강할수록 올라간다. 강배전에서 줄어드는지는 미확인.<TheoryCite ids={['carcea', 'hu', 'shi']} /></>,
    basis: '측정(고형물 농도)',
  },
  {
    name: '쓴맛',
    shape: <>First drop부터 있다. 양은 줄지만 비중은 커진다.<TheoryCite ids={['schmieder', 'gute']} /></>,
    roast: <>강배전일수록 거친 쓴맛 성분으로 바뀐다.<TheoryCite ids={['blumberg', 'frank']} /> 카페인 비중은 약 15%.<TheoryCite ids={['acs']} /></>,
    basis: '해석(성분 측정 기반)',
  },
  {
    name: '탄내',
    shape: <>시간별 측정이 없어 평평하게 그렸다.</>,
    roast: <>로스팅이 양을 정한다.<TheoryCite ids={['blumberg']} /> 무거운 향은 후반까지 남는다.<TheoryCite ids={['sanchez']} /></>,
    basis: '해석',
  },
  {
    name: '떫은맛(그래프 제외)',
    shape: <>시간보다 채널링 등 추출 준비 상태에 달린 것으로 본다.<TheoryCite ids={['rao-astringency']} /></>,
    roast: <>측정 자료를 찾지 못했다.</>,
    basis: '전문가 의견',
  },
];

// lg 미만은 표 대신 맛별 묶음으로 보여준다 — 가로로 밀지 않고 읽게.
export function AttributeTable() {
  return (
    <>
      <div className="hidden lg:block">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${th} w-32`}>맛</th>
              <th className={th}>추출이 진행될 때</th>
              <th className={th}>배전도가 강해질 때</th>
              <th className={`${th} w-64`}>근거 수준</th>
            </tr>
          </thead>
          <tbody>
            {ATTRIBUTES.map((a) => (
              <tr key={a.name}>
                <td className={td}>{a.name}</td>
                <td className={td}>{a.shape}</td>
                <td className={td}>{a.roast}</td>
                <td className={`${td} text-muted-foreground`}>{a.basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="lg:hidden">
        {ATTRIBUTES.map((a) => (
          <article key={a.name} className="border-t border-border py-3">
            <h3 className="m-0 text-body font-medium">{a.name}</h3>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2 sm:gap-6">
              <div className="min-w-0">
                <div className="text-caption text-muted-foreground">추출이 진행될 때</div>
                <div className="text-body">{a.shape}</div>
              </div>
              <div className="min-w-0">
                <div className="text-caption text-muted-foreground">배전도가 강해질 때</div>
                <div className="text-body">{a.roast}</div>
              </div>
            </div>
            <p className="mb-0 mt-1.5 text-caption text-muted-foreground">{a.basis}</p>
          </article>
        ))}
      </div>
    </>
  );
}

export function CupTable() {
  const rows = cupSummary();
  const r = 'text-right tabular';
  // md 미만은 행과 열을 바꾼다 — 끊는 지점 3개가 열이 되어 폰 폭에 들어간다.
  const metrics: { label: string; value: (c: (typeof rows)[number]) => string }[] = [
    { label: 'First drop 후', value: (c) => `약 ${Math.round(c.seconds)}초` },
    { label: '수율(%)', value: (c) => c.yieldPct.toFixed(1) },
    { label: '잔 농도 TDS(%)', value: (c) => c.cupTdsPct.toFixed(1) },
    { label: '트리고넬린 회수(%)', value: (c) => c.trigonellineShare.toFixed(0) },
    { label: '5-CQA 회수(%)', value: (c) => c.cqaShare.toFixed(0) },
    { label: '카페인 회수(%)', value: (c) => c.caffeineShare.toFixed(0) },
  ];
  return (
    <>
      <div className="hidden md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={th}>끊는 지점(원두 20 g)</th>
              {metrics.map((m) => (
                <th key={m.label} className={`${th} text-right`}>{m.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.ratio}>
                <td className={td}>1:{c.ratio} ({c.massG} g)</td>
                {metrics.map((m) => (
                  <td key={m.label} className={`${td} ${r}`}>{m.value(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <table className="w-full border-collapse md:hidden">
        <thead>
          <tr>
            <th className={`${th} pl-0`}>원두 20 g</th>
            {rows.map((c) => (
              <th key={c.ratio} className={`${th} px-2 text-right last:pr-0`}>
                1:{c.ratio}
                <span className="block">{c.massG} g</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {metrics.map((m) => (
            <tr key={m.label}>
              <td className={`${td} pl-0`}>{m.label}</td>
              {rows.map((c) => (
                <td key={c.ratio} className={`${td} ${r} whitespace-nowrap px-2 last:pr-0`}>{m.value(c)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export function SourceList() {
  return (
    <ol className="m-0 grid list-none gap-x-8 gap-y-1.5 p-0 lg:grid-cols-2">
      {THEORY_SOURCES.map((s, i) => (
        <li key={s.id} id={`src-${i + 1}`} className="grid scroll-mt-24 grid-cols-[2rem_1fr] text-caption">
          <span className="tabular text-muted-foreground">[{i + 1}]</span>
          <span className="min-w-0 break-words">
            <a href={s.url} target="_blank" rel="noreferrer" title={s.use} className="underline decoration-border underline-offset-2 hover:decoration-foreground">
              {s.cite}
            </a>
            <span className="text-muted-foreground">
              {' · '}{s.kind} · {s.access === '원문' ? '본문 확인' : s.access === '초록' ? '초록만 확인' : '소개 글로 확인'}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}
