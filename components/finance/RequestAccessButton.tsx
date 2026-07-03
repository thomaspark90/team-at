'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function RequestAccessButton() {
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');

  const request = async () => {
    setState('sending');
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setState('error');
      return;
    }
    const { error } = await supabase
      .schema('finance')
      .from('members')
      .upsert({ id: user.id, email: user.email, role: null }, { onConflict: 'id', ignoreDuplicates: true });
    setState(error ? 'error' : 'done');
  };

  if (state === 'done') {
    return (
      <p style={{ marginTop: 18, fontSize: 14, fontWeight: 600, color: '#12805c' }}>
        ✓ 요청 완료 — 관리자 승인을 기다려주세요
      </p>
    );
  }

  return (
    <div style={{ marginTop: 18 }}>
      <button
        onClick={request}
        disabled={state === 'sending'}
        style={{
          padding: '11px 24px',
          borderRadius: 8,
          border: 'none',
          background: state === 'sending' ? '#CCC' : '#0099FF',
          color: '#fff',
          fontWeight: 700,
          fontSize: 14,
          cursor: state === 'sending' ? 'default' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {state === 'sending' ? '요청 중…' : '접근 권한 요청하기'}
      </button>
      {state === 'error' && (
        <p style={{ marginTop: 8, fontSize: 13, color: '#b23b3b' }}>
          요청에 실패했어요. 잠시 후 다시 시도해주세요.
        </p>
      )}
    </div>
  );
}
