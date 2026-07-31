import { redirect } from 'next/navigation';

// 자료 보충(신한카드·쿠팡)은 지출 자료 분류 우측 사이드바로 통합됨 — 옛 주소는 리다이렉트.
export default function CardPage() {
  redirect('/finance/classify');
}

// 브라우저 탭 제목 — 루트 템플릿(%s · team-at) 적용
export const metadata = { title: '카드 대사' };
