'use client';

import { useEffect, useState } from 'react';

// 교육 탭용 웹 푸시 켜기 — 매니저 출근 전날 20시 알림을 받으려면 기기에서 한 번 허용해야 한다.
// 송금·원두 알림(NotifySettings)과 같은 구독 테이블을 쓰므로 여기서 켜면 그쪽 알림도 함께 온다.
//  · compact: 종 아이콘 하나(시안 A, 매니저·대표 화면). 상태는 점 색(초록=켜짐, 앰버=차단)과 title 툴팁으로만 말한다.
//  · 기본: 문장형(스탭 화면).

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  return Uint8Array.from(Array.from(raw).map((c) => c.charCodeAt(0)));
}

type Status = 'checking' | 'unsupported' | 'ios-browser' | 'off' | 'on' | 'busy' | 'denied';

export default function TeachingPushToggle({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<Status>('checking');
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      if ('Notification' in window && Notification.permission === 'denied') return setStatus('denied');
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        const ios = /iPhone|iPad/.test(navigator.userAgent);
        const standalone = window.matchMedia('(display-mode: standalone)').matches;
        return setStatus(ios && !standalone ? 'ios-browser' : 'unsupported');
      }
      const reg = await navigator.serviceWorker.register('/sw.js');
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? 'on' : 'off');
    })().catch(() => setStatus('unsupported'));
  }, []);

  const enable = async () => {
    setStatus('busy');
    setError('');
    try {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return setStatus('denied');
      const reg = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error('푸시 키가 설정되지 않았어요.');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
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
  };

  const disable = async () => {
    setStatus('busy');
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
  };

  if (status === 'checking') return null;

  if (compact) {
    const hint: Record<Status, string> = {
      checking: '',
      on: '출근 전날 20시 알림 켜짐 — 누르면 끕니다',
      off: '출근 전날 20시 알림 — 누르면 이 기기에서 켭니다',
      busy: '처리 중…',
      denied: '브라우저에서 알림이 차단돼 있어요 — 사이트 설정에서 허용해 주세요',
      'ios-browser': '아이폰은 홈 화면에 추가한 앱에서만 알림을 켤 수 있어요',
      unsupported: '이 브라우저는 알림을 지원하지 않아요',
    };
    const clickable = status === 'on' || status === 'off';
    const dot = status === 'on' ? 'bg-emerald-600' : status === 'denied' ? 'bg-amber-600' : '';
    return (
      <button
        type="button"
        className={`ta-btn relative h-9 w-9 px-0 ${clickable ? '' : 'cursor-default opacity-60 hover:bg-background'}`}
        title={error || hint[status]}
        aria-label={hint[status]}
        disabled={!clickable}
        onClick={status === 'on' ? disable : enable}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {dot && <span className={`absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full ${dot}`} />}
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-body">
      <span className="text-muted-foreground">매니저 출근 전날 저녁 알림</span>
      {status === 'on' && (
        <>
          <span className="text-emerald-600">켜짐</span>
          <button className="underline underline-offset-2 text-muted-foreground" onClick={disable}>끄기</button>
        </>
      )}
      {(status === 'off' || status === 'busy') && (
        <button className="ta-btn h-8" disabled={status === 'busy'} onClick={enable}>
          {status === 'busy' ? '처리 중…' : '이 기기에서 알림 켜기'}
        </button>
      )}
      {status === 'denied' && <span className="text-amber-600">브라우저에서 알림이 차단돼 있어요 — 사이트 설정에서 허용해 주세요.</span>}
      {status === 'ios-browser' && <span className="text-muted-foreground">아이폰은 홈 화면에 추가한 앱에서만 알림을 켤 수 있어요.</span>}
      {status === 'unsupported' && <span className="text-muted-foreground">이 브라우저는 알림을 지원하지 않아요.</span>}
      {error && <span className="ta-error">{error}</span>}
    </div>
  );
}
