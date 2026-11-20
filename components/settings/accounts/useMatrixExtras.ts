'use client';

import { useCallback, useEffect, useState } from 'react';
import { EMPTY_TOPICS, type GardenTopicId, type GardenTopicMap } from '@/lib/garden-notify-topics';

// 권한 표의 '기능 권한 · 알림 담당' 열 데이터 — 화면 출입(garden_tab_access)과 저장 위치가 달라 따로 읽고 쓴다.
//   운영진        → /api/access-editors (finance.schedule_editors)
//   항목별 담당자  → /api/garden-notify-topics (Blob)
//   송금·재고 수신 → /api/notify/recipients (finance.notify_recipients)
// 전부 이메일 기준이라 로그인 계정이 있는 사람만 켤 수 있다.

type Recipient = { email: string; transfer: boolean; stock: boolean };
export type ExtraSource = { type: 'editor' } | { type: 'topic'; id: GardenTopicId } | { type: 'finance'; id: 'transfer' | 'stock' };

const json = async (url: string, init?: RequestInit) => {
  const res = await fetch(url, { cache: 'no-store', ...init });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || '저장에 실패했습니다.');
  return body;
};
const send = (url: string, method: 'POST' | 'DELETE', payload: unknown) =>
  json(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

export function useMatrixExtras(onError: (msg: string) => void) {
  const [topics, setTopics] = useState<GardenTopicMap>(EMPTY_TOPICS);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [editors, setEditors] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.allSettled([json('/api/garden-notify-topics'), json('/api/notify/recipients'), json('/api/access-editors')]).then(([t, r, e]) => {
      if (t.status === 'fulfilled') setTopics({ ...EMPTY_TOPICS, ...t.value });
      if (r.status === 'fulfilled') setRecipients(r.value.recipients ?? []);
      if (e.status === 'fulfilled') setEditors(e.value.editors ?? []);
      setLoaded(true);
    });
  }, []);

  const isOn = useCallback(
    (email: string, s: ExtraSource): boolean => {
      const e = email.toLowerCase();
      if (s.type === 'editor') return editors.includes(e);
      if (s.type === 'topic') return (topics[s.id] ?? []).some((x) => x.toLowerCase() === e);
      return recipients.some((r) => r.email.toLowerCase() === e && r[s.id]);
    },
    [editors, topics, recipients],
  );

  const toggle = useCallback(
    async (email: string, s: ExtraSource) => {
      const e = email.toLowerCase();
      const next = !isOn(e, s);
      try {
        if (s.type === 'editor') {
          setEditors((await send('/api/access-editors', 'POST', { email: e, on: next })).editors ?? []);
        } else if (s.type === 'topic') {
          // 저장 직전에 최신 목록을 다시 읽는다 — 가든 설정에서 다른 사람이 바꾼 담당자를 덮어쓰지 않게
          const fresh: GardenTopicMap = { ...EMPTY_TOPICS, ...(await json('/api/garden-notify-topics')) };
          const others = (fresh[s.id] ?? []).filter((x) => x.toLowerCase() !== e);
          const saved = await send('/api/garden-notify-topics', 'POST', { topic: s.id, emails: next ? [...others, e] : others });
          setTopics({ ...EMPTY_TOPICS, ...saved });
        } else {
          const cur = recipients.find((r) => r.email.toLowerCase() === e);
          const row = { transfer: cur?.transfer ?? false, stock: cur?.stock ?? false, [s.id]: next };
          // 두 항목이 모두 꺼지면 수신자 목록에서 지워 빈 행을 남기지 않는다(가든 설정과 같은 규칙)
          const saved =
            !row.transfer && !row.stock
              ? await send('/api/notify/recipients', 'DELETE', { email: e })
              : await send('/api/notify/recipients', 'POST', { email: e, ...row });
          setRecipients(saved.recipients ?? []);
        }
      } catch (err) {
        onError(err instanceof Error ? err.message : '저장에 실패했습니다.');
      }
    },
    [isOn, recipients, onError],
  );

  return { loaded, isOn, toggle };
}
