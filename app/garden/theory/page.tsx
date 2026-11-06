'use client';

import dynamic from 'next/dynamic';
import PageShell from '@/components/PageShell';
import GardenNav from '@/components/garden/GardenNav';
import TheoryCite from '@/components/garden/theory/TheoryCite';
import { AttributeTable, CupTable, SourceList } from '@/components/garden/theory/TheoryTables';

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
  <p className="ta-prose mb-0 mt-4 text-caption text-muted-foreground">{children}</p>
);

export default function GardenTheoryPage() {
  return (
    <PageShell
      nav={<GardenNav />}
      title="커피 추출 이론"
      subtitle={
        <>
          에스프레소의 맛은 산미, 단맛, 쓴맛 순서로 나오지 않습니다. 모든 성분이 첫 방울에 가장 진하고, 줄어드는 속도만 다릅니다.
          <TheoryCite ids={['schmieder', 'gute']} />
        </>
      }
    >
      <div className="space-y-14">
        <section>
          <h2 className="m-0 mb-1 text-title">배전도별 맛의 변화</h2>
          <p className="ta-prose mt-0 mb-6 text-body text-muted-foreground">
            지금 떨어지는 커피의 상대 강도입니다. 실선은 곡선 모양에 측정 근거가 있고, 점선은 해석입니다. 맛을 측정한 값이 아니므로 눈금이 없습니다.
          </p>
          <RoastFlavorCharts />
          <Note>
            가로축은 원두 대비 추출량이며 1:1, 1:2, 1:3은 첫 방울 후 약 11초, 21초, 32초입니다(원두 20 g, 약 1.9 g/초로 계산, 프리인퓨전 제외). 곡선의 시간 모양은 세 배전도가 같습니다.
            에스프레소를 구간별로 시음한 패널 연구와 배전도별 구간 측정을 찾지 못했기 때문입니다. 높이는 중배전과 중강배전 사이만 콜드브루 수치를 쓴 비율이고<TheoryCite ids={['shi']} />, 강배전과 향미·단맛·탄내의 높이는 연구의 방향을 따라 임의로 정했습니다.
            배전 이름과 Agtron 대응은 제안값입니다.<TheoryCite ids={['kim', 'alacarte']} />
          </Note>
        </section>

        <section>
          <h2 className="m-0 mb-6 text-title">측정된 추출 양상</h2>
          <div className="grid gap-x-8 gap-y-10 md:grid-cols-2">
            <figure className="m-0 min-w-0">
              <figcaption className="mb-3 text-body">
                떨어지는 액체의 농도(첫 방울 = 100%)
                <TheoryCite ids={['schmieder']} />
              </figcaption>
              <ConcentrationChart />
              <Note>모두 처음이 가장 진합니다. 카페인이 가장 느리게 줄어 뒤로 갈수록 비중이 커집니다. 원두 1종, 유량 제어 추출의 곡선 적합값입니다.</Note>
            </figure>
            <figure className="m-0 min-w-0">
              <figcaption className="mb-3 text-body">
                향 성분 신호(계열별 최댓값 = 100%)
                <TheoryCite ids={['sanchez']} />
              </figcaption>
              <VolatileChart />
              <Note>중배전, 9 bar, 18 g → 31.5 g 조건입니다. 논문 그림에서 읽은 값이고 5개 계열 중 3개를 그렸습니다. 계열끼리 양을 비교할 수 없고, 출발이 늦은 데에는 측정 장비의 영향도 포함됩니다.</Note>
            </figure>
          </div>
        </section>

        <section>
          <h2 className="m-0 mb-1 text-title">어디서 끊으면 무엇이 담기나</h2>
          <p className="ta-prose mt-0 mb-6 text-body text-muted-foreground">
            1:1에서 이미 1:3 잔에 담기는 고형물의 약 70%가 나옵니다. 그 뒤는 더 진해지는 것이 아니라 묽어지며 구성이 바뀝니다.
            <TheoryCite ids={['schmieder', 'rao-ratio']} />
          </p>
          <CupTable />
          <Note>회수는 1:3 잔을 100%로 둔 비율이며, 수율·농도·회수는 논문 표 2의 질량으로 계산했습니다.<TheoryCite ids={['schmieder']} /> 원두와 레시피가 바뀌면 값도 달라지므로 목표치로 쓰지 마세요.</Note>
        </section>

        <section>
          <h2 className="m-0 mb-6 text-title">맛별 근거</h2>
          <AttributeTable />
        </section>

        <section>
          <h2 className="m-0 mb-1 text-title">기존 ‘추출 순서’ 그래프를 다시 그린 이유</h2>
          <p className="ta-prose mt-0 mb-0 text-body text-muted-foreground">
            널리 쓰이는 ‘커피 성분의 추출 순서’ 그래프는 가로축이 Lighter→Darker여서, 배전도 그래프를 추출 시간 그래프로 바꿔 쓴 것으로 추정됩니다. 곡선이 배전도별 맛 서술과 잘 맞기 때문입니다.
            <TheoryCite ids={['coffeereview']} /> 다만 원본 출처는 찾지 못해 확정할 수 없습니다. 산미·단맛·쓴맛 순서의 최초 출처도 확인되지 않았고, 빠른 성분이 신맛이라는 연결은 제안자 본인도 추측이라고 밝혔습니다.
            <TheoryCite ids={['gagne']} />
          </p>
        </section>

        <section>
          <h2 className="m-0 mb-6 text-title">출처</h2>
          <SourceList />
          <Note>
            배전도와 추출 수율의 관계는 연구마다 결과가 엇갈려 그래프에 순위를 표시하지 않았습니다.<TheoryCite ids={['lindsey']} /> 네 배전도의 에스프레소가 화학적으로 구분된다는 연구는 배전도별 그래프를 나눈 근거입니다.<TheoryCite ids={['kucera']} /> 구간별 카페인·클로로겐산 감소는 다른 조건에서도 같은 방향이었습니다.<TheoryCite ids={['ludwig']} /> 조사일: 2026-11-06.
          </Note>
        </section>
      </div>
    </PageShell>
  );
}
