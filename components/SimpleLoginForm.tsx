'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// 간편 로그인 — 이름 + 숫자 6자리. 스탭·매니저용.
//  · 로그인: 로그인 API 가 세션 쿠키를 심으면 그대로 이동(첫 로그인은 비밀번호 변경 화면으로).
//  · 가입 신청: 이름(성 포함 3글자) + 본인이 정한 6자리 + 연락 이메일(선택, 승인 알림용). 담당자가 설정에서 역할·지점을 지정해 승인해야 로그인이 열린다.

const pinField = (value: string, set: (v: string) => void, placeholder: string, autoComplete: string) => (
  <input
    className="ta-input w-full tabular"
    placeholder={placeholder}
    type="password"
    inputMode="numeric"
    autoComplete={autoComplete}
    maxLength={6}
    value={value}
    onChange={(e) => set(e.target.value.replace(/\D/g, '').slice(0, 6))}
  />
);

export default function SimpleLoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const switchMode = (m: 'login' | 'signup') => {
    setMode(m);
    setError('');
    setDone('');
    setPin('');
    setConfirm('');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (mode === 'signup' && pin !== confirm) return setError('비밀번호가 서로 다릅니다.');
    setBusy(true);
    try {
      const res = await fetch(mode === 'login' ? '/api/simple-login' : '/api/simple-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'login' ? { name, pin } : { name, pin, email: email.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || '요청에 실패했습니다.');
      if (mode === 'login') {
        router.replace(body.next || '/garden/teaching');
        router.refresh();
        return;
      }
      setDone(
        `${body.name}님, 가입 신청이 접수됐어요. 담당자가 역할·지점을 지정하면 로그인할 수 있습니다.${
          email.trim() ? ' 승인되면 적어주신 이메일로 알려드릴게요.' : ''
        }`
      );
      setMode('login');
      setPin('');
      setConfirm('');
      setEmail('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '요청에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const nameOk = mode === 'login' ? !!name.trim() : /^[가-힣]{3}$/.test(name.trim());
  const ready = nameOk && pin.length === 6 && (mode === 'login' || confirm.length === 6);

  return (
    <form onSubmit={submit} className="w-full space-y-3">
      {done && <p className="text-center text-body text-emerald-600">{done}</p>}
      {mode === 'login' ? (
        <div className="flex gap-2">
          <input
            className="ta-input min-w-0 flex-1"
            placeholder="이름"
            autoComplete="username"
            value={name}
            maxLength={12}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="w-[130px]">{pinField(pin, setPin, '비밀번호 6자리', 'current-password')}</div>
        </div>
      ) : (
        <div className="space-y-2">
          <input
            className="ta-input w-full"
            placeholder="이름 (성 포함 3글자)"
            autoComplete="username"
            value={name}
            maxLength={3}
            onChange={(e) => setName(e.target.value)}
          />
          {pinField(pin, setPin, '비밀번호 — 숫자 6자리', 'new-password')}
          {pinField(confirm, setConfirm, '비밀번호 확인', 'new-password')}
          <input
            className="ta-input w-full"
            placeholder="이메일 (선택 — 승인되면 알려드려요)"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={email}
            maxLength={120}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
      )}
      <button type="submit" className="ta-btn w-full" disabled={busy || !ready}>
        {busy ? '확인 중…' : mode === 'login' ? '이름으로 로그인' : '가입 신청'}
      </button>
      {error && <p className="ta-error text-center text-body">{error}</p>}
      <p className="text-center text-caption text-muted-foreground">
        {mode === 'login' ? (
          <>
            계정이 없나요?{' '}
            <button type="button" className="underline underline-offset-2" onClick={() => switchMode('signup')}>
              가입 신청
            </button>
          </>
        ) : (
          <>
            승인 후 로그인할 수 있어요.{' '}
            <button type="button" className="underline underline-offset-2" onClick={() => switchMode('login')}>
              로그인으로
            </button>
          </>
        )}
      </p>
    </form>
  );
}
