import { redirect } from 'next/navigation';

// 스탭밀 홈 — 송금 요청 기능이 전체 대시보드(/dashboard)로 이동해 IG 메뉴 업데이트로 보낸다.
export default function StudioHomePage() {
  redirect('/studio/menu');
}
