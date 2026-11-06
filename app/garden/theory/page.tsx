'use client';

import dynamic from 'next/dynamic';
import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import TheoryCite from '@/components/garden/theory/TheoryCite';
import { AttributeTable, CupTable, SourceList } from '@/components/garden/theory/TheoryTables';
import { THEORY_SOURCES } from '@/lib/garden/extraction-theory';

// 커피 추출 이론 — 스탭 교육·현장 참고용. 데이터와 근거는 lib/garden/extraction-theory.ts.
// recharts 는 별도 청크로 지연 로드한다.
const loading = () => <p className="text-body text-muted-foreground">그래프 불러오는 중…</p>;
const RoastFlavorCharts = dynamic(() => import('@/components/garden/theory/RoastFlavorCharts'), { ssr: false, loading });
const ConcentrationChart = dynamic(
  () => import('@/components/garden/theory/MeasuredCharts').then((m) => m.ConcentrationChart),
  { ssr: false, loading },
);
const VolatileChart = dynamic(
  () => import('@/components/garden/theory/MeasuredCharts').then((m) => m.VolatileChart),
  { ssr: false, loading },
);

const Note = ({ children }: { children: React.ReactNode }) => (
  <p className="ta-prose mb-0 mt-2 text-caption text-muted-foreground">{children}</p>
);

const Heading = ({ children }: { children: React.ReactNode }) => <h2 className="m-0 mb-3 text-title">{children}</h2>;

export default function GardenTheoryPage() {
  return (
    <PageShell
      nav={<GardenNav />}
    >
      {/* 이 페이지만 여백을 넓게 쓴다 — PageShell 공통 제목 줄 대신 직접 그린다 */}
      <header className="mb-16 pt-6 sm:mb-24 sm:pt-14">
        <h1 className="m-0 text-display">커피 추출 이론</h1>
        <div className="ta-prose mt-3 text-body text-muted-foreground">
          모든 성분은 First drop에 가장 진하고, 줄어드는 속도만 다릅니다.
          <TheoryCite ids={['schmieder', 'gute']} />
        </div>
      </header>
      <div className="space-y-16 pb-10 sm:space-y-24 sm:pb-20">
        <section>
          <Heading>배전도별 추출 양상</Heading>
          <p className="ta-prose m-0 mb-2 text-body text-muted-foreground">측정값이 아닌 모식도라 눈금이 없습니다. 항목별 근거는 아래 표에 있습니다.</p>
          <RoastFlavorCharts />
          <Note>
            가로축은 원두 대비 음료 무게 비율입니다. 시간은 머신과 분쇄도에 따라 달라지므로 쓰지 않았습니다. 구간별 시음 연구를 찾지 못해 곡선 모양은 세 배전도가 같고, 높이는 일부만 수치 근거가 있으며<TheoryCite ids={['shi']} /> 나머지는 연구의 방향을 따라 임의로 정했습니다.
          </Note>
        </section>

        <section>
          <Heading>측정된 추출 양상</Heading>
          <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
            <figure className="m-0 min-w-0">
              <figcaption className="mb-2 text-body">
                액체 농도(First drop = 100%)
                <TheoryCite ids={['schmieder']} />
              </figcaption>
              <ConcentrationChart />
              <Note>카페인이 가장 느리게 줄어 뒤로 갈수록 비중이 커집니다. 원두 1종의 곡선 적합값입니다.</Note>
            </figure>
            <figure className="m-0 min-w-0">
              <figcaption className="mb-2 text-body">
                향 성분 신호(계열별 최댓값 = 100%)
                <TheoryCite ids={['sanchez']} />
              </figcaption>
              <VolatileChart />
              <Note>중배전, 18 g → 31.5 g. 논문 그림에서 읽은 값으로, 계열끼리 양은 비교할 수 없고 늦은 출발에는 장비 영향도 있습니다.</Note>
            </figure>
          </div>
        </section>

        <section>
          <Heading>비율별 수율 및 TDS</Heading>
          <p className="ta-prose m-0 mb-2 text-body text-muted-foreground">
            1:1에서 1:3 잔 고형물의 약 70%가 나옵니다.
            <TheoryCite ids={['schmieder', 'rao-ratio']} />
          </p>
          <CupTable />
          <Note>수율은 원두에서 녹아 나온 비율, TDS(총용존고형물)는 음료에 녹아 있는 고형물의 비율, 회수는 1:3 잔 대비 비율입니다. 원두 1종의 측정값이므로 목표치로 쓰지 마세요.<TheoryCite ids={['schmieder']} /></Note>
        </section>

        <section>
          <Heading>요소별 추출 과정 및 요약</Heading>
          <AttributeTable />
        </section>

        <details id="theory-sources" className="group">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <h2 className="m-0 text-title">출처</h2>
            <span className="text-caption text-muted-foreground">{THEORY_SOURCES.length}건</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-180">
              <path d="M2.5 4.5 6 8l3.5-3.5" />
            </svg>
          </summary>
          <div className="mt-3">
            <SourceList />
            <Note>
              배전도와 수율의 관계는 연구마다 엇갈려 표시하지 않았습니다.<TheoryCite ids={['lindsey']} /> 배전도별 그래프를 나눈 근거<TheoryCite ids={['kucera']} />, 구간별 카페인·클로로겐산 감소의 교차 확인<TheoryCite ids={['ludwig']} />. 조사일 2026-11-06.
            </Note>
          </div>
        </details>
      </div>
    </PageShell>
  );
}
