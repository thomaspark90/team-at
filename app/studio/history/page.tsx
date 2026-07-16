import { redirect } from 'next/navigation';

// 송금 관리가 전체 대시보드로 이동 — 기존 링크(북마크·알림)용 리다이렉트.
export default function LegacyTransferManagePage() {
  redirect('/dashboard/history');
}
