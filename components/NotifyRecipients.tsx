'use client';

import { useState } from 'react';

// 알림 수신자 관리 — admin(대표) 전용. 사람별로 송금 요청/원두 재고 알림을 따로 켜고 끈다.
export interface RecipientRow {
  email: string;
  transfer: boolean; // 송금 요청 알림
  stock: boolean; // 원두 재고(20%·소진) 알림
}

export default function NotifyRecipients({ initial }: { initial: RecipientRow[] }) {
  const [rows, setRows] = useState<RecipientRow[]>(initial);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(method: 'POST' | 'DELETE', payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/notify/recipients', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '처리에 실패했어요.');
      setRows(j.recipients as RecipientRow[]);
      if (method === 'POST') setInput('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const toggle = (r: RecipientRow, key: 'transfer' | 'stock') =>
    call('POST', { email: r.email, transfer: r.transfer, stock: r.stock, [key]: !r[key] });

  const topicBtn = (on: boolean) =>
    `rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
      on
        ? 'border-foreground/50 text-foreground'
        : 'border-border text-muted-foreground/60 line-through'
    }`;

  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-4">
      <h2 className="m-0 text-[15px] font-medium">알림 수신자 관리</h2>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        사람별로 <strong>송금 요청</strong> · <strong>원두 재고</strong>(20%·소진) 알림을
        따로 켜고 끌 수 있어요. 배지를 눌러 토글하세요. 각자 이 페이지의 알림 설정에서 이메일·푸시 채널을
        켤 수 있어요. (구글 로그인에 쓰는 이메일로 등록해야 푸시알림이 연결돼요)
      </p>

      <div className="mt-3 flex flex-col gap-1.5">
        {rows.length === 0 && (
          <span className="text-[12px] text-amber-600">수신자가 없어요 — 기본값(대표)으로 발송돼요.</span>
        )}
        {rows.map((r) => (
          <div key={r.email} className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5">
            <span className="min-w-0 flex-1 truncate text-[12px]">{r.email}</span>
            <button onClick={() => toggle(r, 'transfer')} disabled={busy} className={topicBtn(r.transfer)} title="송금 요청 알림 켜기/끄기">
              송금
            </button>
            <button onClick={() => toggle(r, 'stock')} disabled={busy} className={topicBtn(r.stock)} title="원두 재고 알림 켜기/끄기">
              원두
            </button>
            <button
              onClick={() => {
                if (confirm(`${r.email} 을(를) 수신자에서 제거할까요?`)) call('DELETE', { email: r.email });
              }}
              disabled={busy}
              className="text-muted-foreground hover:text-red-500 disabled:opacity-60"
              aria-label={`${r.email} 제거`}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          type="email"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && input.trim()) call('POST', { email: input.trim() });
          }}
          placeholder="이메일 추가 (구글 로그인 계정)"
          className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-[13px] text-foreground outline-none focus:border-foreground/40"
        />
        <button
          onClick={() => input.trim() && call('POST', { email: input.trim() })}
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
