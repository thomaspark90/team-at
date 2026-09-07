'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// 간편 로그인 — 이름 + 숫자 6자리. 대표가 설정에서 발급한 계정(스탭·매니저)용.
// 로그인 API 가 세션 쿠키를 심으면 그대로 이동한다(첫 로그인은 비밀번호 변경 화면으로).
export default function SimpleLoginForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/simple-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, pin }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || '로그인하지 못했습니다.');
      router.replace(body.next || '/garden/teaching');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : '로그인하지 못했습니다.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="w-full space-y-3">
      <div className="flex gap-2">
        <input
          className="ta-input min-w-0 flex-1"
          placeholder="이름"
          autoComplete="username"
          value={name}
          maxLength={12}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="ta-input w-[120px] tabular"
          placeholder="비밀번호 6자리"
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
      </div>
      <button type="submit" className="ta-btn w-full" disabled={busy || !name.trim() || pin.length !== 6}>
        {busy ? '확인 중…' : '이름으로 로그인'}
      </button>
      {error && <p className="ta-error text-center text-[13px]">{error}</p>}
    </form>
  );
}
