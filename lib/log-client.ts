// 클라이언트에서 사용 기록을 남긴다. 실패해도 본 동작을 막지 않는다(fire-and-forget).
export function logUsage(action: string, detail?: string) {
  try {
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, detail }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* 로깅 실패 무시 */
  }
}
