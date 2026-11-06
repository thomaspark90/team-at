'use client';

import dynamic from 'next/dynamic';
import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import TheoryCite from '@/components/garden/theory/TheoryCite';
import { AttributeTable, CupTable, SourceList } from '@/components/garden/theory/TheoryTables';
import LabCite from './LabCite';
import { GrindMeasuredTable } from './GrindSensoryChart';
import { BataliAxisTable } from './YieldMap';
import RulesTable from './RulesTable';
import { THEORY_SOURCES } from '@/lib/garden/extraction-theory';
import { LAB_SOURCES, labSourceNumber } from '@/lib/garden/extraction-lab';

// 커피 머신 추출 이론 — 대표 검토용 시안. 기존 /garden/theory 의 네 섹션을 그대로 두고 분쇄·온도·수율 지도 섹션을 덧붙였다.
// 승인되면 기존 페이지를 이 구성으로 교체하고 이 경로는 지운다. 데이터는 lib/garden/extraction-lab.ts.
const loading = () => <p className="text-body text-muted-foreground">그래프 불러오는 중…</p>;
// next/dynamic 옵션은 객체 리터럴로 직접 써야 한다(변수로 빼면 빌드 오류)
const RoastFlavorCharts = dynamic(() => import('@/components/garden/theory/RoastFlavorCharts'), { ssr: false, loading });
const ConcentrationChart = dynamic(() => import('@/components/garden/theory/MeasuredCharts').then((m) => m.ConcentrationChart), { ssr: false, loading });
const VolatileChart = dynamic(() => import('@/components/garden/theory/MeasuredCharts').then((m) => m.VolatileChart), { ssr: false, loading });
const GrindDecayChart = dynamic(() => import('./PositionCharts').then((m) => m.GrindDecayChart), { ssr: false, loading });
const TempDecayChart = dynamic(() => import('./PositionCharts').then((m) => m.TempDecayChart), { ssr: false, loading });
const CameronTimeChart = dynamic(() => import('./CameronCharts').then((m) => m.CameronTimeChart), { ssr: false, loading });
const CameronYieldChart = dynamic(() => import('./CameronCharts').then((m) => m.CameronYieldChart), { ssr: false, loading });
const GrindSensoryChart = dynamic(() => import('./GrindSensoryChart').then((m) => m.GrindSensoryChart), { ssr: false, loading });
const YieldMap = dynamic(() => import('./YieldMap').then((m) => m.YieldMap), { ssr: false, loading });
const TemperatureCharts = dynamic(() => import('./TemperatureCharts'), { ssr: false, loading });

const Note = ({ children }: { children: React.ReactNode }) => <p className="ta-prose mb-0 mt-2 text-caption text-muted-foreground">{children}</p>;
const Lead = ({ children }: { children: React.ReactNode }) => <p className="ta-prose m-0 mb-2 text-body text-muted-foreground">{children}</p>;
const Heading = ({ children, tag }: { children: React.ReactNode; tag?: 'new' | 'drip' }) => (
  <h2 className="m-0 mb-3 flex items-center gap-2 text-title">
    {children}
    {tag === 'new' && <span className="rounded-full bg-accent px-2 py-0.5 text-caption font-normal text-muted-foreground">신규</span>}
    {tag === 'drip' && <span className="rounded-full px-2 py-0.5 text-caption font-medium" style={{ background: 'color-mix(in srgb, var(--chart-cat-8) 12%, transparent)', color: 'var(--chart-cat-8)' }}>드립 데이터</span>}
  </h2>
);

export default function TheoryLabContent() {
  return (
    <PageShell nav={<GardenNav />}>
      <header className="mb-16 pt-6 sm:mb-24 sm:pt-14">
        <p className="m-0 mb-3 text-caption text-muted-foreground">대표 검토용 시안 — 스탭 계정에는 보이지 않습니다. 기존 「커피 추출 이론」은 그대로 있습니다.</p>
        <h1 className="m-0 text-display">커피 머신 추출 이론</h1>
        <div className="ta-prose mt-3 text-body text-muted-foreground">
          에스프레소 머신(가압 추출) 기준입니다. 필터커피에는 적용하지 마세요. 모든 성분은 First drop에 가장 진하고, 줄어드는 속도만 다릅니다.
          <TheoryCite ids={['schmieder', 'gute']} /> 분쇄도와 온도는 이 곡선의 모양이 아니라 샷이 곡선 위 어디서 끝나는지를 바꿉니다.
          <LabCite ids={['cameron', 'smrke']} />
        </div>
      </header>

      <div className="space-y-16 pb-10 sm:space-y-24 sm:pb-20">
        {/* ── 기존 섹션 1~4 (/garden/theory 와 동일) ── */}
        <section>
          <Heading>배전도별 추출 양상</Heading>
          <Lead>측정값이 아닌 모식도라 눈금이 없습니다. 항목별 근거는 아래 표에 있습니다.</Lead>
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
          <Lead>
            1:1에서 1:3 잔 고형물의 약 70%가 나옵니다.
            <TheoryCite ids={['schmieder', 'rao-ratio']} />
          </Lead>
          <CupTable />
          <Note>수율은 원두에서 녹아 나온 비율, TDS(총용존고형물)는 음료에 녹아 있는 고형물의 비율, 회수는 1:3 잔 대비 비율입니다. 원두 1종의 측정값이므로 목표치로 쓰지 마세요.<TheoryCite ids={['schmieder']} /></Note>
        </section>

        <section>
          <Heading>요소별 추출 과정 및 요약</Heading>
          <AttributeTable />
        </section>

        {/* ── 신규 섹션 ── */}
        <section>
          <Heading tag="new">분쇄·온도는 곡선의 위치만 옮긴다</Heading>
          <Lead>
            같은 논문에서 분쇄와 온도만 바꿔 다시 적합한 농도 곡선입니다. 세 선이 거의 겹칩니다.<TheoryCite ids={['schmieder']} /> 곡선의 모양을 바꾼 변수는 유량뿐이었습니다.
          </Lead>
          <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
            <figure className="m-0 min-w-0">
              <figcaption className="mb-2 text-body">분쇄 3단계 — 액체 농도(First drop = 100%)</figcaption>
              <GrindDecayChart />
              <Note>E65S 1.4 / 1.7 / 2.0 = 273 / 277 / 295 µm. 1:2 지점 잔 TDS 3.65 / 3.88 / 3.92 g. 95% 신뢰 띠가 대부분 겹침.<TheoryCite ids={['schmieder']} /></Note>
            </figure>
            <figure className="m-0 min-w-0">
              <figcaption className="mb-2 text-body">온도 3단계 — 액체 농도(First drop = 100%)</figcaption>
              <TempDecayChart />
              <Note>실측 79 / 88 / 97 °C. 1:2 지점 잔 TDS 3.96 / 3.88 / 4.01 g — 18 °C 차이에 1% 남짓.<TheoryCite ids={['schmieder']} /></Note>
            </figure>
          </div>
          <Note>
            원두 1종 · 20 g · 유량 제어(평균 압력 2.6~5.3 bar) 측정. 9 bar·넓은 분쇄 범위에서는 미검증. 분쇄가 바꾸는 것은 아래 그래프의 끝점(수율)과 샷마다의 흩어짐입니다. 바리스타들이 말하는 "모양 변화"는 퍽 안의 균일성과 압력 궤적을 가리킵니다.<LabCite ids={['hoffmann', 'hedrick', 'smrke']} />
          </Note>
        </section>

        <section>
          <Heading tag="new">분쇄 설정 → 샷 시간과 수율</Heading>
          <Lead>
            곱게 갈수록 시간은 직선으로 늘지만, 수율은 오르다 꺾이고 샷 간 편차가 약 3배 커집니다.<LabCite ids={['cameron']} />
          </Lead>
          <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
            <figure className="m-0 min-w-0">
              <figcaption className="mb-2 text-body">샷 시간(초)</figcaption>
              <CameronTimeChart />
            </figure>
            <figure className="m-0 min-w-0">
              <figcaption className="mb-2 text-body">수율(%) — 띠는 ±1 SD, 점선은 균질 흐름 모델(20 g)</figcaption>
              <CameronYieldChart />
            </figure>
          </div>
          <Note>
            EK43 커피 버 · 20 g → 40 g · 92 °C · <b>6 bar</b> · 5반복 · 논문 그림에서 읽은 값(±1 s, ±0.1 %p). 9 bar에서는 고운 쪽이 막혀 압력을 낮춤. 설정 숫자는 그 그라인더에서만 유효. Decent 유량 제어·Hedrick 8단계 스윕에서는 고운 쪽 하락이 약하거나 없었음 — 봉우리는 법칙이 아니라 퍽 준비·압력·그라인더에 따라 움직이는 조건부 현상.<LabCite ids={['cameron', 'ribes', 'mckeon']} />
          </Note>
        </section>

        <section>
          <Heading tag="new">분쇄 3단계 → 산미와 떫은맛</Heading>
          <Lead>
            훈련 패널이 유의하게 구분한 것은 산미와 떫은맛 둘뿐입니다. 쓴맛·단맛·바디는 같은 방향이었지만 유의하지 않았습니다.<LabCite ids={['khu']} />
          </Lead>
          <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
            <figure className="m-0 min-w-0">
              <figcaption className="mb-2 text-body">관능 강도(0~15)</figcaption>
              <GrindSensoryChart />
              <Note>진한 막대 = 유의(p&lt;0.05) · 옅은 막대 = 유의하지 않음</Note>
            </figure>
            <figure className="m-0 min-w-0">
              <figcaption className="mb-2 text-body">같은 샷의 측정값</figcaption>
              <GrindMeasuredTable />
            </figure>
          </div>
          <Note>
            강배전 블렌드 · 7.5 g → 30 mL · 2011년 · 패널 10명. 전도도식 TDS 미터라 수율 절대값은 굴절계 수치와 비교 불가. 분쇄 단계는 시간으로 정의. 챔피언들이 "곱게 = 자극적 산미·따가움"이라 부르는 것과 교육 현장의 "곱게 = 쓴맛"은 같은 질감 변화(떫음·거침)를 다른 말로 부르는 것으로 보임.<LabCite ids={['khu', 'bang', 'ansta']} />
          </Note>
        </section>

        <section>
          <Heading tag="drip">수율–농도 맛 방향 지도</Heading>
          <Lead>
            훈련 패널이 농도(TDS)와 수율을 독립적으로 바꿔 그린 지도입니다.<LabCite ids={['batali']} /> 산미·쓴맛·떫은맛을 더 크게 움직인 축은 수율이 아니라 <b>농도</b>였습니다. 에스프레소로 같은 실험을 한 연구는 없습니다.
          </Lead>
          <div className="grid gap-x-8 gap-y-6 md:grid-cols-[3fr_2fr] md:items-start">
            <figure className="m-0 min-w-0">
              <YieldMap />
            </figure>
            <figure className="m-0 min-w-0">
              <figcaption className="mb-2 text-body">
                축을 따라 움직인 크기(0~100 척도)<LabCite ids={['batali']} />
              </figcaption>
              <BataliAxisTable />
              <Note>온도 87 / 90 / 93 °C는 농도·수율을 고정하면 유의하지 않았음(p=0.11).</Note>
            </figure>
          </div>
          <Note>
            UC Davis 드립 연구(Frost·Batali·Guinard). 저자들이 "에스프레소는 향후 과제"라 명시. 축에 눈금을 두지 않은 이유: 드립 TDS 0.8~1.6% vs 에스프레소 7~12%로 척도가 다름. 에스프레소에서 분쇄·도징은 두 축을 동시에(때로 반대 방향으로) 움직임 — 굵게 갈면 수율↓(신맛↑ 방향)이면서 농도↓(신맛↓ 방향). 위 경희대 범위에서는 수율 효과가 이김. 비율을 늘리면 수율↑·농도↓로 둘 다 신맛↓ 방향이라 모든 출처가 일치.<LabCite ids={['batali', 'bh', 'bb-time']} />
          </Note>
        </section>

        <section>
          <Heading tag="new">온도 → 수율</Heading>
          <Lead>매장에서 굴절계로 잰 세 자료입니다. 기울기는 대략 °C당 0.1 %p. 기기와 원두가 달라 한 선으로 잇지 않았습니다.</Lead>
          <TemperatureCharts />
          <Note>
            80 vs 93 °C 에스프레소 삼각검사: 24명 중 11명만 구별(우연 수준).<LabCite ids={['klotz']} /> 머신 표시 온도와 실측은 다름(방현영: 표시 88.x = 실측 92).<LabCite ids={['bang']} /> 챔피언급(방현영·권혁수·Campos 2021 WBC)은 온도를 91~92 °C 상수로 두고 비율·분쇄로 조정.<LabCite ids={['bang', 'kwon']} /> 샷 간 잡음 바닥이 0.03~0.17 %p라 0.5 %p 미만 차이는 의미 없음.<LabCite ids={['socratic', 'fivesenses', 'kaffeemacher', 'bb-temp']} />
          </Note>
        </section>

        <section>
          <Heading tag="new">현장 조정 규칙 — 전제 조건과 근거</Heading>
          <Lead>
            조정 순서: <b>비율 → 분쇄 → 도징(±0.5 g) → 온도(실측 가능할 때만)</b>. 규칙 충돌의 대부분은 "한 번에 한 변수만" 바꾸는 어법과, 도징을 바꾼 뒤 분쇄·시간을 다시 잡는 챔피언 어법의 차이에서 나옵니다.
          </Lead>
          <RulesTable />
          <div className="ta-prose mt-4 rounded-[10px] bg-accent px-4 py-3 text-body">
            압력계 판별식(Hedrick): 압력이 낮고 샷이 빠르면서 시다 → 곱게. 압력이 이미 꽉 차고 느린데 시다 → 굵게 또는 비율을 늘린다.<LabCite ids={['hedrick']} />
          </div>
        </section>

        <details id="theory-sources" className="group">
          <summary className="flex w-fit cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
            <h2 className="m-0 text-title">출처</h2>
            <span className="text-caption text-muted-foreground">{THEORY_SOURCES.length + LAB_SOURCES.length}건</span>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="text-muted-foreground transition-transform group-open:rotate-180">
              <path d="M2.5 4.5 6 8l3.5-3.5" />
            </svg>
          </summary>
          <div className="mt-3 space-y-4">
            <SourceList />
            <ol className="m-0 grid list-none gap-x-8 gap-y-1.5 border-t border-border p-0 pt-4 lg:grid-cols-2">
              {LAB_SOURCES.map((s) => (
                <li key={s.id} id={`src-${labSourceNumber(s.id)}`} className="grid scroll-mt-24 grid-cols-[2rem_1fr] text-caption">
                  <span className="tabular text-muted-foreground">[{labSourceNumber(s.id)}]</span>
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
            <Note>
              배전도와 수율의 관계는 연구마다 엇갈려 표시하지 않았습니다.<TheoryCite ids={['lindsey']} /> 전주연(2019 WBC)·영어권 WBC 챔피언의 분쇄·온도 발언은 찾지 못했습니다. 조사일 2026-11-06.
            </Note>
          </div>
        </details>
      </div>
    </PageShell>
  );
}
