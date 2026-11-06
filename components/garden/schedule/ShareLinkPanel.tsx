'use client';

import { useEffect, useState } from 'react';
import { STORES, type StoreId } from '@/lib/types';

// 직원용 읽기 전용 링크. 새로 만들면 이전 링크는 바로 막힌다(유출 시 회수 수단).
export default function ShareLinkPanel() {
  const [links, setLinks] = useState<Partial<Record<StoreId, string>>>({});
  const [confirming, setConfirming] = useState<StoreId | null>(null);
  const [copied, setCopied] = useState<StoreId | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/garden-schedule/link', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setLinks(j.links)))
      .catch(() => setError('불러오지 못했습니다.'));
  }, []);

  const issue = async (store: StoreId) => {
    setError(null);
    setConfirming(null);
    const r = await fetch('/api/garden-schedule/link', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ store }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error ?? '만들지 못했습니다.');
    setLinks({ ...links, [store]: j.token });
  };
  const urlOf = (token: string) => `${window.location.origin}/schedule/${token}`;

  return (
    <div className="space-y-4">
      <p className="m-0 text-body text-muted-foreground">배포된 주의 계획(이름·시간)만 보입니다. 메모·실제 근무·연차는 보이지 않습니다.</p>
      {STORES.map(({ id, label }) => {
        const token = links[id];
        return (
          <div key={id} className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body">
            <span className="w-[64px]">{label}</span>
            {token ? (
              <>
                <button
                  type="button"
                  className="ta-btn"
                  onClick={async () => {
                    await navigator.clipboard.writeText(urlOf(token));
                    setCopied(id);
                  }}
                >
                  {copied === id ? '복사됨' : '링크 복사'}
                </button>
                {confirming === id ? (
                  <button type="button" className="text-destructive" onClick={() => issue(id)}>이전 링크를 막고 새로 만들기 ›</button>
                ) : (
                  <button type="button" className="text-muted-foreground" onClick={() => setConfirming(id)}>새 링크 만들기</button>
                )}
              </>
            ) : (
              <button type="button" className="ta-btn" onClick={() => issue(id)}>링크 만들기</button>
            )}
          </div>
        );
      })}
      {error && <p className="m-0 text-body text-destructive">{error}</p>}
    </div>
  );
}
