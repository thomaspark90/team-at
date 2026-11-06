import type { ReactNode } from 'react';
import LabCite from './LabCite';

// 현장 조정 규칙 — 판정·전제 조건·반대 출처. 규칙 본문은 리서치 보고서 §현장 규칙 표를 따른다.
type Verdict = 'ok' | 'cond' | 'none';
const VERDICT: Record<Verdict, { label: string; className: string }> = {
  ok: { label: '지지', className: 'text-[var(--chart-cat-4)]' },
  cond: { label: '조건부', className: 'text-[var(--chart-cat-3)]' },
  none: { label: '근거 없음', className: 'text-[var(--chart-cat-6)]' },
};

const RULES: { rule: string; verdict: Verdict; verdictNote?: string; basis: ReactNode; against: ReactNode }[] = [
  {
    rule: '산미가 화사하지 않으면 분쇄를 푼다(굵게)',
    verdict: 'ok',
    basis: (
      <>
        경희대 산미 coarse 10.8 vs fine 7.5(p&lt;0.05)<LabCite ids={['khu']} /> · RamG "같은 23초여도 굵은 쪽이 가장 신맛"<LabCite ids={['ramg']} /> · 방현영 "분쇄가 산미에 가장 직접"<LabCite ids={['bang']} /> · 드립 지도 수율↓→시트러스↑<LabCite ids={['batali']} />
      </>
    ),
    against: <>원인이 온도 과다·에이징 부족이면 분쇄로 못 고침(방현영). 과하면 "식초 같은 신맛"(안스타)<LabCite ids={['ansta']} /></>,
  },
  {
    rule: '쓴맛이 나면 굵게 / 온도를 내린다',
    verdict: 'ok',
    verdictNote: '방향만',
    basis: (
      <>
        경희대 very fine 떫은맛 8.7(p&lt;0.05)<LabCite ids={['khu']} /> · 빈브라더스 ≥95 °C 쓴맛<LabCite ids={['bb-temp']} /> · Andueza 96·98 °C 더 쓰고 떫음<LabCite ids={['andueza']} />
      </>
    ),
    against: (
      <>
        기전은 "덜 과다추출"이 아니라 농도↓·균일화. Rao: 바리스타가 과다추출이라 부르는 것은 대개 채널링 떫은맛<LabCite ids={['rao-myths']} />. 온도↓는 95 °C 이상에서만 근거
      </>
    ),
  },
  {
    rule: '산미가 튀면 도징을 줄인다',
    verdict: 'cond',
    basis: (
      <>
        <b>추출량 고정 + 분쇄 유지</b>일 때만. 도징↓ = 비율↑ = 수율↑ → 산미↓. Hoffmann 18→17 g(42 g 유지) 시연<LabCite ids={['hoffmann']} /> · Cameron 모델 16 g 27.4% vs 24 g 21.7%<LabCite ids={['cameron']} />
      </>
    ),
    against: (
      <>
        도징을 바꾼 뒤 분쇄·시간을 다시 잡으면 반대. 안스타 "오히려 도징을 높여보는 것도 방법"<LabCite ids={['ansta']} /> · Hedrick 19→19.5 g으로 산미 눌렀음<LabCite ids={['hedrick']} />
      </>
    ),
  },
  {
    rule: '신맛이 나면 곱게 / 온도를 올린다',
    verdict: 'cond',
    verdictNote: '온도는 약함',
    basis: <>곱게: 샷이 빠르고 압력이 낮을 때만. Hoffmann 기본값<LabCite ids={['hoffmann']} /></>,
    against: (
      <>
        Hedrick: 압력이 이미 9 bar이고 느린데 시면 <b>이미 너무 곱다 → 굵게 또는 비율↑</b><LabCite ids={['hedrick']} />. 온도↑: 방현영 "온도 올려 더 뽑는 건 성분과 무관"<LabCite ids={['bang']} /> · 권혁수 "대부분 온도 문제 아님"<LabCite ids={['kwon']} /> · 드립 온도 무효과<LabCite ids={['batali']} /> · 삼각검사 비구별<LabCite ids={['klotz']} />
      </>
    ),
  },
  {
    rule: '수율이 안 나오면 도징을 늘린다',
    verdict: 'none',
    basis: (
      <>
        지지 발언을 찾지 못함. 수율(%)은 도징↓일수록 오름 — Cameron·Hendon·Hoffmann·커피찾는남자 22 g/34 g 17.8% &lt; 20 g/41 g 18.9%<LabCite ids={['cameron', 'hoffmann', 'explorer']} />
      </>
    ),
    against: <>같은 추출량에서 도징↑는 <b>농도</b>(TDS)↑. "수율"을 농도·바디의 뜻으로 쓰는 어법이면 성립 — 용어를 바로잡을 것</>,
  },
];

const th = 'px-3 py-1.5 text-left text-caption font-normal tracking-[0.04em] text-muted-foreground';
const td = 'border-t border-border px-3 py-2 align-top text-body';

export default function RulesTable() {
  return (
    <>
      <div className="hidden lg:block">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className={`${th} w-[26%]`}>규칙</th>
              <th className={`${th} w-[9%]`}>판정</th>
              <th className={th}>전제 조건 · 근거</th>
              <th className={`${th} w-[28%]`}>반대 · 단서</th>
            </tr>
          </thead>
          <tbody>
            {RULES.map((r) => (
              <tr key={r.rule}>
                <td className={td}>{r.rule}</td>
                <td className={`${td} ${VERDICT[r.verdict].className}`}>
                  {VERDICT[r.verdict].label}
                  {r.verdictNote && <span className="block text-caption text-muted-foreground">{r.verdictNote}</span>}
                </td>
                <td className={td}>{r.basis}</td>
                <td className={`${td} text-muted-foreground`}>{r.against}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="lg:hidden">
        {RULES.map((r) => (
          <article key={r.rule} className="border-t border-border py-3">
            <h3 className="m-0 text-body font-medium">
              {r.rule} <span className={`ml-1 text-caption ${VERDICT[r.verdict].className}`}>{VERDICT[r.verdict].label}{r.verdictNote ? ` · ${r.verdictNote}` : ''}</span>
            </h3>
            <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2 sm:gap-6">
              <div className="min-w-0">
                <div className="text-caption text-muted-foreground">전제 조건 · 근거</div>
                <div className="text-body">{r.basis}</div>
              </div>
              <div className="min-w-0">
                <div className="text-caption text-muted-foreground">반대 · 단서</div>
                <div className="text-body text-muted-foreground">{r.against}</div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
