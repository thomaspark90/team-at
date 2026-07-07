'use client';

import { useEffect, useState } from 'react';

// 알림 설정 — 송금 알림 수신자(대표)에게만 노출.
// 이메일 알림 = 계정 단위(DB), 푸시알림 = 기기 단위(브라우저 구독).
function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from(Array.from(raw).map((c) => c.charCodeAt(0)));
}

type PushStatus = 'unsupported' | 'ios-browser' | 'off' | 'on' | 'busy';

export default function NotifySettings() {
  const [emailEnabled, setEmailEnabled] = useState<boolean | null>(null); // null = 로딩
  const [push, setPush] = useState<PushStatus>('busy');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/notify/prefs')
      .then((r) => r.json())
      .then((j) => setEmailEnabled(!!j.emailEnabled))
      .catch(() => setEmailEnabled(true));

    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        const ios = /iPhone|iPad/.test(navigator.userAgent);
        const standalone = window.matchMedia('(display-mode: standalone)').matches;
        setPush(ios && !standalone ? 'ios-browser' : 'unsupported');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      setPush(sub ? 'on' : 'off');
    })().catch(() => setPush('unsupported'));
  }, []);

  async function toggleEmail() {
    if (emailEnabled === null) return;
    const next = !emailEnabled;
    setEmailEnabled(next); // 낙관적 갱신
    setError(null);
    const res = await fetch('/api/notify/prefs', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emailEnabled: next }),
    }).catch(() => null);
    if (!res || !res.ok) {
      setEmailEnabled(!next);
      setError('이메일 설정 저장에 실패했어요. 다시 시도해주세요.');
    }
  }

  async function enablePush() {
    setPush('busy');
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') throw new Error('알림 권한이 거부됐어요. 브라우저 설정에서 허용해주세요.');
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error('푸시 키가 설정되지 않았어요.');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key),
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!res.ok) throw new Error((await res.json()).error || '구독 저장에 실패했어요.');
      setPush('on');
    } catch (e) {
      setError((e as Error).message);
      setPush('off');
    }
  }

  async function disablePush() {
    setPush('busy');
    setError(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        });
        await sub.unsubscribe();
      }
      setPush('off');
    } catch (e) {
      setError((e as Error).message);
      setPush('on');
    }
  }

  const toggleBtn = (on: boolean, busy: boolean, onClick: () => void, offLabel = '꺼짐', onLabel = '켜짐 ✓') => (
    <button
      onClick={onClick}
      disabled={busy}
      className={`rounded-lg px-3 py-1.5 text-[12px] transition-colors disabled:opacity-60 ${
        on ? 'bg-foreground font-medium text-background' : 'border border-border text-muted-foreground hover:text-foreground'
      }`}
    >
      {busy ? '…' : on ? onLabel : offLabel}
    </button>
  );

  return (
    <div className="rounded-2xl border border-border bg-card px-5 py-4">
      <h2 className="m-0 text-[15px] font-medium">알림 설정</h2>
      <p className="mt-0.5 text-[12px] text-muted-foreground">새 송금 요청이 등록되면 알림을 받아요. 채널별로 켜고 끌 수 있어요.</p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[13px]">이메일 알림</span>
        {emailEnabled === null ? (
          <span className="text-[12px] text-muted-foreground">…</span>
        ) : (
          toggleBtn(emailEnabled, false, toggleEmail)
        )}
      </div>

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div>
          <span className="text-[13px]">푸시알림 (이 기기)</span>
          {push === 'ios-browser' && (
            <p className="m-0 mt-0.5 text-[11px] text-muted-foreground">
              아이폰은 사파리 공유 → &lsquo;홈 화면에 추가&rsquo; 후, 그 아이콘으로 열어야 켤 수 있어요.
            </p>
          )}
          {push === 'unsupported' && (
            <p className="m-0 mt-0.5 text-[11px] text-muted-foreground">이 브라우저는 푸시알림을 지원하지 않아요.</p>
          )}
        </div>
        {(push === 'on' || push === 'off' || push === 'busy') &&
          toggleBtn(push === 'on', push === 'busy', push === 'on' ? disablePush : enablePush)}
      </div>

      {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}
