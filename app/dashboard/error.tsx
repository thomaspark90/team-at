'use client';

// 세그먼트 에러 바운더리 — 데이터 조회 실패 시 Next 기본 오류 화면 대신 한국어 안내를 보여준다.
export default function SegmentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-center">
      <div className="flex max-w-[420px] flex-col items-center gap-4">
        <div className="text-[32px]">⚠️</div>
        <p className="m-0 text-[15px] font-medium text-foreground">화면을 불러오지 못했어요</p>
        <p className="m-0 text-[13px] text-muted-foreground">
          일시적인 문제일 수 있어요. 잠시 후 다시 시도해 주세요. 계속되면 새로고침하거나 관리자에게 알려주세요.
        </p>
        <button onClick={reset} className="ta-btn-primary">
          다시 시도
        </button>
        <p className="m-0 break-all text-[11px] text-muted-foreground">{error.message}</p>
      </div>
    </div>
  );
}
