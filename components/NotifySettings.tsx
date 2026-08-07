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

// variant 'recipient' = 담당자(이메일+푸시, 새 요청 알림) / 'requester' = 직원(푸시만, 내 요청 완료 알림)
export default function NotifySettings({ variant = 'recipient' }: { variant?: 'recipient' | 'requester' }) {
  const isRecipient = variant === 'recipient';
  const [emailEnabled, setEmailEnabled] = useState<boolean | null>(null); // null = 로딩
  const [push, setPush] = useState<PushStatus>('busy');
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (isRecipient) {
      // 401/403 응답도 JSON 이라 .ok 확인 없이 파싱하면 "이메일 알림 꺼짐"으로 잘못 표시된다
      fetch('/api/notify/prefs')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setEmailEnabled(j ? !!j.emailEnabled : true))
        .catch(() => setEmailEnabled(true));
    }

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
  }, [isRecipient]);

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
      <h2 className="m-0 text-[15px] font-medium">{isRecipient ? '알림 설정' : '내 요청 알림'}</h2>
      <p className="mt-0.5 text-[12px] text-muted-foreground">
        {isRecipient
          ? '새 송금 요청이 등록되면 알림을 받아요. 채널별로 켜고 끌 수 있어요.'
          : '내가 올린 송금 요청이 이체 완료되면 알림을 받아요. 완료 이메일은 자동으로 오고, 푸시는 아래에서 켤 수 있어요.'}
      </p>

      {isRecipient && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[13px]">이메일 알림</span>
          {emailEnabled === null ? (
            <span className="text-[12px] text-muted-foreground">…</span>
          ) : (
            toggleBtn(emailEnabled, false, toggleEmail)
          )}
        </div>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2">
        <div>
          <span className="flex items-center gap-1.5 text-[13px]">
            푸시알림 (이 기기)
            <button
              onClick={() => setShowGuide(true)}
              className="rounded-full border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              aria-label="푸시알림 설정 방법"
            >
              ? 설정 방법
            </button>
          </span>
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

      {/* ---------- 푸시알림 설정 안내 팝업 ---------- */}
      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:max-w-[480px] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="m-0 text-[15px] font-medium">푸시알림 설정 방법</h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              앱 설치 없이, 이 사이트가 직접 알림을 보내요. 알림을 받을 기기마다 아래처럼 한 번만 켜면 됩니다.
            </p>

            <div className="mt-4 rounded-xl border border-border bg-background p-4">
              <h4 className="m-0 text-[13px] font-medium">🤖 안드로이드 (갤럭시 등)</h4>
              <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-[13px]">
                <li>
                  <strong>크롬</strong>(또는 삼성인터넷)으로 이 사이트에 접속해요
                </li>
                <li>
                  이 화면에서 <strong>알림 켜기</strong> 버튼을 눌러요
                </li>
                <li>
                  브라우저가 묻는 알림 권한에서 <strong>허용</strong>을 눌러요
                </li>
              </ol>
              <p className="mt-2 text-[12px] text-muted-foreground">
                이후 일반 앱 알림처럼 잠금화면과 상단 알림바에 떠요. 홈 화면 추가는 필요 없어요.
              </p>
            </div>

            <div className="mt-3 rounded-xl border border-border bg-background p-4">
              <h4 className="m-0 text-[13px] font-medium">🍎 아이폰 / 아이패드</h4>
              <p className="mt-1.5 text-[12px] text-amber-600">
                아이폰은 사파리 탭에서는 알림을 못 받아요. 꼭 홈 화면에 추가한 뒤 그 아이콘으로 열어야 해요.
              </p>
              <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-[13px]">
                <li>
                  <strong>사파리</strong>로 이 사이트에 접속해요
                </li>
                <li>
                  하단 가운데 <strong>공유 버튼</strong>(네모에 ↑)을 눌러요
                </li>
                <li>
                  목록에서 <strong>&lsquo;홈 화면에 추가&rsquo;</strong>를 찾아 눌러요 (안 보이면 목록을 아래로 스크롤)
                </li>
                <li>
                  홈 화면에 생긴 <strong>team-at 아이콘</strong>으로 사이트를 다시 열고 로그인해요
                </li>
                <li>
                  이 화면에서 <strong>알림 켜기</strong> → 권한 <strong>허용</strong>을 눌러요
                </li>
              </ol>
              <p className="mt-2 text-[12px] text-muted-foreground">
                이후 일반 앱처럼 잠금화면·알림센터에 떠요. iOS 16.4 이상 필요(2023년 3월 이후 업데이트된 아이폰이면 대부분 가능).
              </p>
            </div>

            <div className="mt-3 rounded-xl border border-border bg-background p-4">
              <h4 className="m-0 text-[13px] font-medium">💻 PC (맥 · 윈도우)</h4>
              <p className="mt-1.5 text-[13px]">
                크롬·엣지·사파리로 접속해 <strong>알림 켜기</strong> → <strong>허용</strong>. 화면 구석에 시스템 알림으로 떠요.
              </p>
            </div>

            <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-[12px]">
              <p className="m-0 font-medium">잘 안 될 때</p>
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5">
                <li>실수로 권한을 &lsquo;차단&rsquo;했다면: 브라우저 주소창 왼쪽 자물쇠(또는 설정) → 알림 → 허용으로 변경 후 다시 켜기</li>
                <li>알림이 오다가 끊겼다면: 이 화면에서 알림을 껐다가 다시 켜보세요</li>
                <li>아이폰에서 버튼이 안 보이면: 홈 화면 아이콘으로 열었는지 확인하세요 (사파리 탭 ✕)</li>
              </ul>
            </div>

            <button
              onClick={() => setShowGuide(false)}
              className="mt-4 w-full rounded-xl bg-foreground py-2.5 text-[14px] font-medium text-background"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
