// 가든 섹션 공통 — 하위 페이지들이 클라이언트 컴포넌트라 여기서 탭 제목을 지정한다
export const metadata = { title: 'Garden Service' };

export default function GardenLayout({ children }: { children: React.ReactNode }) {
  return children;
}
