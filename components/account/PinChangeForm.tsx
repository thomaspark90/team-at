'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// 간편 계정 비밀번호 변경 — 현재 6자리 + 새 6자리(확인). 첫 로그인이면 안내 문구가 바뀐다.
export default function PinChangeForm() {
  const router = useRouter();
  const [state, setState] = useState<{ simpleLogin: boolean; displayName: string | null; pinResetRequired: boolean } | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/account/pin', { cache: 'no-store' })
      .then((r) => r.json())
      .then(setState)
      .catch(() => setState({ simpleLogin: false, displayName: null, pinResetRequired: false }));
  }, []);

  const submit = async () => {
    setError('');
    if (next !== confirm) return setError('새 비밀번호가 서로 다릅니다.');
    setBusy(true);
    try {
      const res = await fetch('/api/account/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPin: current, newPin: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || '변경하지 못했습니다.');
      router.replace('/garden/teaching');
    } catch (e) {
      setError(e instanceof Error ? e.message : '변경하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  if (!state) return <p className="text-body text-muted-foreground">불러오는 중…</p>;
  if (!state.simpleLogin) {
    return <p className="text-body text-muted-foreground">구글 계정은 여기서 비밀번호를 바꾸지 않습니다.</p>;
  }

  const pinInput = (value: string, set: (v: string) => void, placeholder: string, autoFocus = false) => (
    <input
      className="ta-input w-full tabular"
      inputMode="numeric"
      pattern="\d{6}"
      maxLength={6}
      autoComplete="off"
      type="password"
      placeholder={placeholder}
      value={value}
      autoFocus={autoFocus}
      onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 6))}
    />
  );

  return (
    <div className="max-w-[360px] space-y-8">
      <div>
        <h1 className="text-display font-medium">비밀번호 변경</h1>
        <p className="mt-1 text-body text-muted-foreground">
          {state.pinResetRequired
            ? `${state.displayName}님, 처음 로그인이시네요. 대표에게 받은 비밀번호를 본인만 아는 숫자 6자리로 바꿔주세요.`
            : '숫자 6자리. 연속·반복 숫자는 쓸 수 없어요.'}
        </p>
      </div>
      <div className="space-y-4">
        <label className="block">
          <span className="ta-label">{state.pinResetRequired ? '받은 비밀번호' : '현재 비밀번호'}</span>
          {pinInput(current, setCurrent, '••••••', true)}
        </label>
        <label className="block">
          <span className="ta-label">새 비밀번호</span>
          {pinInput(next, setNext, '숫자 6자리')}
        </label>
        <label className="block">
          <span className="ta-label">새 비밀번호 확인</span>
          {pinInput(confirm, setConfirm, '한 번 더')}
        </label>
        {error && <p className="ta-error text-body">{error}</p>}
        <button className="ta-btn-primary w-full" disabled={busy || current.length !== 6 || next.length !== 6 || confirm.length !== 6} onClick={submit}>
          {busy ? '변경 중…' : '변경하기'}
        </button>
      </div>
    </div>
  );
}
