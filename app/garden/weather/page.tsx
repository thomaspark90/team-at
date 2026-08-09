import TabNav from '@/components/TabNav';
import GardenNav from '@/components/garden/GardenNav';
import OrderOutlookCard from '@/components/garden/OrderOutlookCard';
import WeatherSalesReport from '@/components/garden/WeatherSalesReport';

// 날씨 × 판매 분석 — 대시보드 날씨 스트립에서 진입하는 재무 권한자용 리포트.
// 가든 탭 레지스트리(lib/garden/tabs)의 'weather' 탭 — 탭 권한으로 페이지를 거르고,
// 데이터 자체는 API 의 재무 역할 확인 + pos_sales RLS 로 한 번 더 걸러진다.
export default function GardenWeatherPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <TabNav />
      <GardenNav />
      <div className="mx-auto max-w-[1100px] px-6 py-8" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* 페이지 제목은 내비 활성 탭이 이미 알려줘서 생략 — 분석 전제조건 설명만 남김(2026-08-09) */}
        <p className="m-0 text-[13px] text-muted-foreground">
          POS 매출(pos_sales) 전 기간을 과거 날씨와 조인해 기온·강수 밴드별 효과를 추정합니다. 기준: 일최고 10–20° ·
          비 없음 · 요일/트렌드 통제.
        </p>
        <OrderOutlookCard />
        <WeatherSalesReport />
      </div>
    </div>
  );
}

export const metadata = { title: '날씨 분석' };
