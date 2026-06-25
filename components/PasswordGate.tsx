'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PasswordGate() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await fetch('/api/auth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      sessionStorage.setItem('auth', 'ok');
      router.push('/studio');
    } else {
      setError(true);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg">
      <form onSubmit={handleSubmit} className="bg-white p-9 rounded-[20px] border border-line shadow-card w-80 space-y-4">
        <h1 className="text-xl font-bold text-center text-fg tracking-tight">team-at</h1>
        <p className="text-sm text-center text-gray-400">스토리 제작 도구</p>
        <input
          type="password"
          value={password}
          onChange={(e) => { setPassword(e.target.value); setError(false); }}
          placeholder="비밀번호"
          className="w-full bg-gray-100 border border-line rounded-md px-4 py-2.5 text-sm text-fg focus:outline-none focus:border-accent"
          autoFocus
        />
        {error && <p className="text-red-500 text-xs text-center">비밀번호가 틀렸습니다</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-fg hover:bg-accent disabled:opacity-50 text-white font-semibold py-3.5 rounded-pill transition-colors"
        >
          {loading ? '확인 중...' : '입장'}
        </button>
      </form>
    </div>
  );
}
