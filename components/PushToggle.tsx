'use client';

import { useEffect, useState } from 'react';

// 웹 푸시 알림 켜기/끄기 — 송금 알림 수신자(대표)에게만 노출.
// 기기별 1회 허용 필요. 아이폰은 홈 화면 추가(PWA)에서만 동작.
function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from(Array.from(raw).map((c) => c.charCodeAt(0)));
}

type Status = 'unsupported' | 'ios-browser' | 'off' | 'on' | 'busy';

export default function PushToggle() {
  const [status, setStatus] = useState<Status>('busy');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        // 아이폰 사파리(홈화면 미추가)는 PushManager 자체가 없음
        const ios = /iPhone|iPad/.test(navigator.userAgent);
        const standalone = window.matchMedia('(display-mode: standalone)').matches;
        setStatus(ios && !standalone ? 'ios-browser' : 'unsupported');
        return;
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? 'on' : 'off');
    })().catch(() => setStatus('unsupported'));
  }, []);

  async function enable() {
    setStatus('busy');
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
      setStatus('on');
    } catch (e) {
      setError((e as Error).message);
      setStatus('off');
    }
  }

  async function disable() {
    setStatus('busy');
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
      setStatus('off');
    } catch (e) {
      setError((e as Error).message);
      setStatus('on');
    }
  }

  if (status === 'unsupported') return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card px-5 py-3">
      <div>
        <span className="text-[13px]">이 기기로 송금 요청 푸시알림</span>
        {status === 'ios-browser' && (
          <p className="m-0 mt-0.5 text-[11px] text-muted-foreground">
            아이폰은 사파리 공유 → &lsquo;홈 화면에 추가&rsquo; 후, 그 아이콘으로 열어야 켤 수 있어요.
          </p>
        )}
        {error && <p className="m-0 mt-0.5 text-[11px] text-red-500">{error}</p>}
      </div>
      {status !== 'ios-browser' && (
        <button
          onClick={status === 'on' ? disable : enable}
          disabled={status === 'busy'}
          className={`rounded-lg px-3 py-1.5 text-[12px] transition-colors disabled:opacity-60 ${
            status === 'on'
              ? 'bg-foreground font-medium text-background'
              : 'border border-border text-muted-foreground hover:text-foreground'
          }`}
        >
          {status === 'busy' ? '…' : status === 'on' ? '알림 켜짐 ✓' : '알림 켜기'}
        </button>
      )}
    </div>
  );
}
