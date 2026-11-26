'use client';

import { useEffect } from 'react';

const VISITOR_KEY = 'garden-schedule-visitor';

// 직원 링크 열람 기록 — 화면에는 아무것도 그리지 않는다. 같은 탭에서 같은 주는 한 번만 보낸다.
export default function LinkViewBeacon({ token, weekStart }: { token: string; weekStart: string }) {
  useEffect(() => {
    let visitor = '';
    try {
      const sent = `garden-schedule-viewed-${weekStart}`;
      if (sessionStorage.getItem(sent)) return;
      sessionStorage.setItem(sent, '1');
      visitor = localStorage.getItem(VISITOR_KEY) ?? '';
      if (!visitor) {
        visitor = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(VISITOR_KEY, visitor);
      }
    } catch {
      // 저장소가 막힌 브라우저 — 기기 구분 없이 열람만 센다.
    }
    fetch('/api/schedule-link/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, weekStart, visitor }), keepalive: true }).catch(() => {});
  }, [token, weekStart]);
  return null;
}
