'use client';

import { useState } from 'react';
import { STORES, type StoreId } from '@/lib/types';
import { api } from './types';

// 프로필 등록 — 구글 로그인 팀 계정이 교육 탭을 처음 열 때 한 번. 이름은 매니저에게 실명으로 보인다.
export default function ProfileSetup({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState('');
  const [stores, setStores] = useState<StoreId[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const toggle = (id: StoreId) => setStores((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/garden-teaching/profile', { method: 'POST', body: JSON.stringify({ name, stores }) });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-[420px] space-y-8">
      <div>
        <h1 className="text-display font-medium">교육</h1>
        <p className="mt-1 text-body text-muted-foreground">
          처음이시네요. 매니저가 알아볼 수 있게 이름과 근무 지점을 알려주세요.
        </p>
      </div>
      <div className="space-y-6">
        <label className="block">
          <span className="ta-label">이름</span>
          <input className="ta-input w-full" value={name} onChange={(e) => setName(e.target.value)} placeholder="홍길동" maxLength={12} />
        </label>
        <div>
          <span className="ta-label">근무 지점</span>
          <div className="flex gap-2">
            {STORES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle(s.id)}
                className={`ta-btn ${stores.includes(s.id) ? 'bg-primary text-primary-foreground hover:opacity-90' : ''}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="ta-error text-body">{error}</p>}
        <button className="ta-btn-primary" disabled={busy || !name.trim() || stores.length === 0} onClick={submit}>
          {busy ? '저장 중…' : '시작하기'}
        </button>
      </div>
    </div>
  );
}
