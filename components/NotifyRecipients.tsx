'use client';

import { useState } from 'react';

// 알림 수신자 관리 — admin(대표) 전용. 여기 등록된 사람에게 송금 요청·원두 재고 알림이 간다.
export default function NotifyRecipients({ initial }: { initial: string[] }) {
  const [emails, setEmails] = useState<string[]>(initial);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function mutate(method: 'POST' | 'DELETE', email: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/notify/recipients', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '처리에 실패했어요.');
      setEmails(j.recipients as string[]);
      if (method === 'POST') setInput('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-4">
      <h2 className="m-0 text-[15px] font-medium">알림 수신자 관리</h2>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        여기 등록된 사람에게 새 송금 요청과 원두 재고(20%·소진) 알림이 함께 가요. 각자 이 페이지의 알림
        설정에서 이메일·푸시 채널을 켤 수 있어요. (구글 로그인에 쓰는 이메일로 등록해야 푸시알림이 연결돼요)
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {emails.length === 0 && (
          <span className="text-[12px] text-amber-600">수신자가 없어요 — 기본값(대표)으로 발송돼요.</span>
        )}
        {emails.map((e) => (
          <span key={e} className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1 text-[12px]">
            {e}
            <button
              onClick={() => {
                if (confirm(`${e} 을(를) 수신자에서 제거할까요?`)) mutate('DELETE', e);
              }}
              disabled={busy}
              className="text-muted-foreground hover:text-red-500 disabled:opacity-60"
              aria-label={`${e} 제거`}
            >
              ×
            </button>
          </span>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          type="email"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim()) mutate('POST', input.trim());
          }}
          placeholder="이메일 추가 (구글 로그인 계정)"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-foreground/40"
        />
        <button
          onClick={() => input.trim() && mutate('POST', input.trim())}
          disabled={busy || !input.trim()}
          className="rounded-lg bg-foreground px-4 py-2 text-[13px] font-medium text-background disabled:opacity-60"
        >
          추가
        </button>
      </div>

      {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
