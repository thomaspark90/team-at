// 라우트 전환 중 표시 — 각 섹션 loading.tsx가 공용으로 사용.
// 내비를 눌렀는데 아무 변화가 없어 재클릭하게 되는 혼동을 막는다.
export default function RouteLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <p className="animate-pulse text-[13px] text-muted-foreground">불러오는 중…</p>
    </div>
  );
}
