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
// bare = 카드 테두리·제목 없이 내용만 (가든 설정의 '알림' 카드 안에 넣을 때)
export default function NotifySettings({
  variant = 'recipient',
  bare = false,
}: {
  variant?: 'recipient' | 'requester';
  bare?: boolean;
}) {
  const isRecipient = variant === 'recipient';
  const [emailEnabled, setEmailEnabled] = useState<boolean | null>(null); // null = 로딩
  const [push, setPush] = useState<PushStatus>('busy');
  const [error, setError] = useState<string | null>(null);
  // 안내 팝업 — setup(최초 설정 방법) / unblock(권한 '차단' 해제 방법)
  const [guide, setGuide] = useState<'setup' | 'unblock' | null>(null);
  // 브라우저가 알림 권한을 '차단'으로 기억한 상태 — 사이트가 다시 물을 수 없어 해제 안내로 연결
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    if (isRecipient) {
      // 401/403 응답도 JSON 이라 .ok 확인 없이 파싱하면 "이메일 알림 꺼짐"으로 잘못 표시된다
      fetch('/api/notify/prefs')
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => setEmailEnabled(j ? !!j.emailEnabled : true))
        .catch(() => setEmailEnabled(true));
    }

    (async () => {
      // 이미 거부된 기기는 '알림 켜기'를 눌러보기 전에도 해제 안내를 보여준다
      if ('Notification' in window && Notification.permission === 'denied') setDenied(true);
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
      if (perm !== 'granted') {
        // 거부 문구는 아래 denied 캡션(해제 방법 버튼 포함)이 담당 — error 와 이중 표시 방지
        setDenied(true);
        setPush('off');
        return;
      }
      setDenied(false);
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
      className={`rounded-lg px-3 py-1.5 text-[13px] transition-colors disabled:opacity-60 ${
        on ? 'bg-foreground font-medium text-background' : 'border border-border text-muted-foreground hover:text-foreground'
      }`}
    >
      {busy ? '…' : on ? onLabel : offLabel}
    </button>
  );

  return (
    <div>
      {!bare && (
        <>
          <h2 className="m-0 text-[15px] font-medium">{isRecipient ? '알림 설정' : '내 요청 알림'}</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {isRecipient
              ? '새 송금 요청이 등록되면 알림을 받아요. 채널별로 켜고 끌 수 있어요.'
              : '내가 올린 송금 요청이 이체 완료되면 알림을 받아요. 완료 이메일은 자동으로 오고, 푸시는 아래에서 켤 수 있어요.'}
          </p>
        </>
      )}

      {isRecipient && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="text-[13px]">이메일 알림</span>
          {emailEnabled === null ? (
            <span className="text-[13px] text-muted-foreground">…</span>
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
              onClick={() => setGuide('setup')}
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

      {/* 권한이 '차단'된 기기 — 사이트가 다시 물을 수 없으니 해제 방법 팝업으로 바로 연결 */}
      {denied && push !== 'unsupported' && push !== 'ios-browser' && (
        <p className="mt-2 text-[11px] text-destructive">
          알림 권한이 거부됐어요. 브라우저 설정에서 허용해주세요.{' '}
          <button
            onClick={() => setGuide('unblock')}
            className="font-medium underline underline-offset-2"
          >
            차단 해제 방법 보기
          </button>
        </p>
      )}
      {error && <p className="mt-2 text-[11px] text-destructive">{error}</p>}

      {/* ---------- 푸시알림 안내 팝업 (setup = 최초 설정 / unblock = 차단 해제) ---------- */}
      {guide && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
          onClick={() => setGuide(null)}
        >
          <div
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:max-w-[480px] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {guide === 'unblock' ? (
              <>
                <h3 className="m-0 text-[15px] font-medium">알림 차단 해제 방법</h3>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  권한 요청에서 &lsquo;차단&rsquo;을 누르면 브라우저가 기억해서 다시 묻지 않아요. 아래처럼 브라우저
                  설정에서 직접 허용으로 바꾼 뒤, 이 화면을 새로고침하고 <strong>알림 켜기</strong>를 다시 누르면
                  됩니다.
                </p>

                <div className="mt-4 rounded-xl bg-muted/40 p-4">
                  <h4 className="m-0 text-[13px] font-medium">PC 크롬 · 엣지 · 웨일</h4>
                  <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-[13px]">
                    <li>
                      주소창 왼쪽 <strong>자물쇠(또는 ⚙ 튜너) 아이콘</strong>을 눌러요
                    </li>
                    <li>
                      <strong>알림</strong> 스위치를 켜요 — 항목이 없으면 <strong>&lsquo;사이트 설정&rsquo;</strong>으로
                      들어가 알림을 <strong>허용</strong>으로 변경
                    </li>
                    <li>탭으로 돌아와 새로고침 → <strong>알림 켜기</strong></li>
                  </ol>
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    안 보이면 주소창에 <span className="break-all font-mono text-[11px]">chrome://settings/content/notifications</span> 을
                    입력해 &lsquo;차단됨&rsquo; 목록에서 이 사이트를 허용으로 바꿔요.
                  </p>
                </div>

                <div className="mt-3 rounded-xl bg-muted/40 p-4">
                  <h4 className="m-0 text-[13px] font-medium">맥 사파리</h4>
                  <p className="mt-1.5 text-[13px]">
                    Safari 메뉴 → <strong>설정 → 웹사이트 → 알림</strong>에서 이 사이트를 <strong>허용</strong>으로
                    변경 → 새로고침 후 알림 켜기.
                  </p>
                  <p className="mt-2 text-[13px] text-muted-foreground">
                    맥 공통: 브라우저에서 허용해도 안 뜨면 <strong>시스템 설정 → 알림</strong>에서 크롬/사파리의 알림
                    허용이 켜져 있는지 확인하세요.
                  </p>
                </div>

                <div className="mt-3 rounded-xl bg-muted/40 p-4">
                  <h4 className="m-0 text-[13px] font-medium">안드로이드 크롬</h4>
                  <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-[13px]">
                    <li>주소창 <strong>자물쇠</strong> → <strong>권한</strong> → 알림 <strong>허용</strong></li>
                    <li>
                      없으면 크롬 <strong>⋮ → 설정 → 사이트 설정 → 알림</strong>의 &lsquo;차단됨&rsquo; 목록에서 해제
                    </li>
                    <li>새로고침 → <strong>알림 켜기</strong></li>
                  </ol>
                </div>

                <div className="mt-3 rounded-xl bg-muted/40 p-4">
                  <h4 className="m-0 text-[13px] font-medium">아이폰 (홈 화면 앱)</h4>
                  <p className="mt-1.5 text-[13px]">
                    아이폰 <strong>설정 → 알림 → team-at</strong>에서 알림 허용을 켜요. (사파리 탭에서는 원래 푸시가
                    안 돼요 — 홈 화면에 추가한 아이콘으로 열어야 해요)
                  </p>
                </div>
              </>
            ) : (
              <>
            <h3 className="m-0 text-[15px] font-medium">푸시알림 설정 방법</h3>
            <p className="mt-1 text-[13px] text-muted-foreground">
              앱 설치 없이, 이 사이트가 직접 알림을 보내요. 알림을 받을 기기마다 아래처럼 한 번만 켜면 됩니다.
            </p>

            <div className="mt-4 rounded-xl bg-muted/40 p-4">
              <h4 className="m-0 text-[13px] font-medium">안드로이드 (갤럭시 등)</h4>
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
              <p className="mt-2 text-[13px] text-muted-foreground">
                이후 일반 앱 알림처럼 잠금화면과 상단 알림바에 떠요. 홈 화면 추가는 필요 없어요.
              </p>
            </div>

            <div className="mt-3 rounded-xl bg-muted/40 p-4">
              <h4 className="m-0 text-[13px] font-medium">아이폰 / 아이패드</h4>
              <p className="mt-1.5 text-[13px] text-amber-600">
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
              <p className="mt-2 text-[13px] text-muted-foreground">
                이후 일반 앱처럼 잠금화면·알림센터에 떠요. iOS 16.4 이상 필요(2023년 3월 이후 업데이트된 아이폰이면 대부분 가능).
              </p>
            </div>

            <div className="mt-3 rounded-xl bg-muted/40 p-4">
              <h4 className="m-0 text-[13px] font-medium">PC (맥 · 윈도우)</h4>
              <p className="mt-1.5 text-[13px]">
                크롬·엣지·사파리로 접속해 <strong>알림 켜기</strong> → <strong>허용</strong>. 화면 구석에 시스템 알림으로 떠요.
              </p>
            </div>

            <div className="mt-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-[13px]">
              <p className="m-0 font-medium">잘 안 될 때</p>
              <ul className="mt-1.5 flex list-disc flex-col gap-1 pl-5">
                <li>
                  실수로 권한을 &lsquo;차단&rsquo;했다면:{' '}
                  <button
                    onClick={() => setGuide('unblock')}
                    className="font-medium underline underline-offset-2"
                  >
                    차단 해제 방법 보기
                  </button>
                </li>
                <li>알림이 오다가 끊겼다면: 이 화면에서 알림을 껐다가 다시 켜보세요</li>
                <li>아이폰에서 버튼이 안 보이면: 홈 화면 아이콘으로 열었는지 확인하세요 (사파리 탭 ✕)</li>
              </ul>
            </div>
              </>
            )}

            <button
              onClick={() => setGuide(null)}
              className="mt-4 w-full rounded-xl bg-foreground py-2.5 text-[13px] font-medium text-background"
            >
              확인
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
