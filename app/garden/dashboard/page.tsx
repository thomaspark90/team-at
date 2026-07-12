import { redirect } from 'next/navigation';

// 구 대시보드 URL — 대시보드가 가든 첫 화면(/garden)이 되면서 리다이렉트만 남김
export default function GardenDashboardRedirect() {
  redirect('/garden');
}
