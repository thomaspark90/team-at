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
      <p className="mt-[18px] text-[13px] text-foreground">
        ✓ 요청 완료 — 관리자 승인을 기다려주세요
      </p>
    );
  }

  return (
    <div className="mt-[18px]">
      <button
        onClick={request}
        disabled={state === 'sending'}
        className="ta-btn-primary"
      >
        {state === 'sending' ? '요청 중…' : '접근 권한 요청하기'}
      </button>
      {state === 'error' && (
        <p className="mt-2 text-[13px] text-destructive">
          요청에 실패했어요. 잠시 후 다시 시도해주세요.
        </p>
      )}
    </div>
  );
}
