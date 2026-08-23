import { redirect } from 'next/navigation';

// 리포트 홈(업무 칸반 보드)은 제거 — 카드가 전부 /finance/pnl 로 가는 안내였고,
// 회계 대시보드의 칸반도 같은 이유로 이미 제거됐다(2026-08-01). 2026-08-21 대표 지시.
// 기존 북마크·저장된 링크를 살리려고 경로만 남겨 관리손익으로 넘긴다.
export default function DashboardPage() {
  redirect('/finance/pnl');
}
