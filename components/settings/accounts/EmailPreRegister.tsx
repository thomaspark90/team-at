'use client';

import { useEffect, useState } from 'react';
import { TEAM_DOMAIN } from '@/lib/finance/access';

// 이메일로 계정 추가(사전 등록) + 외부 이메일 허용 목록 — 로그인한 적 없는 인원도 계정을 미리 만들어 권한을 걸어둔다.
// 외부 이메일(gmail 등)은 허용 목록(finance.allowed_emails)에 함께 등록해 로그인을 연다.
export default function EmailPreRegister({
  registered,
  allowed,
  onAdded,
  onAllowedRemoved,
  onError,
}: {
  registered: Set<string>; // 이미 계정이 있거나 허용 목록에 있는 이메일(소문자)
  allowed: string[];
  onAdded: (json: { user: unknown; allowed?: boolean }, email: string) => void;
  onAllowedRemoved: (email: string) => void;
  onError: (msg: string) => void;
}) {
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);
  // 알림 설정(항목별 담당자·송금/재고 수신자)에 수기로 입력된 이메일 — 사전 등록 드롭다운 후보.
  // 조회 실패는 조용히 스킵: 드롭다운만 안 뜨고 직접 입력은 그대로 된다.
  const [manualEmails, setManualEmails] = useState<string[]>([]);

  useEffect(() => {
    Promise.allSettled([
      fetch('/api/garden-notify-topics', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})),
      fetch('/api/notify/recipients', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})),
    ]).then(([topics, rec]) => {
      const fromTopics = topics.status === 'fulfilled' ? (Object.values(topics.value as Record<string, string[]>).flat() as string[]) : [];
      const fromRecipients =
        rec.status === 'fulfilled' ? (((rec.value as { recipients?: { email: string }[] })?.recipients ?? []).map((r) => r.email) as string[]) : [];
      setManualEmails(Array.from(new Set([...fromTopics, ...fromRecipients].map((e) => String(e).trim().toLowerCase()))).sort());
    });
  }, []);
  const candidates = manualEmails.filter((e) => !registered.has(e));

  const add = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || adding) return;
    setAdding(true);
    onError('');
    try {
      const res = await fetch('/api/garden-tab-access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '추가에 실패했습니다.');
      onAdded(json, email);
      setNewEmail('');
    } catch (e) {
      onError(e instanceof Error ? e.message : '추가에 실패했습니다.');
    } finally {
      setAdding(false);
    }
  };

  // 외부 이메일 허용 해제 — 계정·권한 설정은 남고 로그인만 다시 막힌다
  const removeAllowed = async (email: string) => {
    onError('');
    try {
      const res = await fetch('/api/garden-tab-access', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '삭제에 실패했습니다.');
      onAllowedRemoved(email);
    } catch (e) {
      onError(e instanceof Error ? e.message : '삭제에 실패했습니다.');
    }
  };

  return (
    <div>
      <p className="ta-label" style={{ marginBottom: 4 }}>
        이메일 계정 추가 (사전 등록)
      </p>
      <p className="ta-prose text-body text-muted-foreground" style={{ margin: '0 0 16px', lineHeight: 1.6 }}>
        아직 로그인한 적 없는 인원도 이메일로 미리 등록해 권한을 걸어둘 수 있어요. @{TEAM_DOMAIN} 외 이메일(gmail 등)은 허용 목록에 함께
        등록돼 로그인이 열립니다. 같은 이메일로 구글 로그인하면 등록된 계정에 자동 연결돼요. <b>권한을 따로 끄지 않으면 전체 접근</b>이니,
        추가 직후 펼쳐지는 줄에서 필요한 화면만 켜두세요.
      </p>
      <div style={{ display: 'flex', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
        {candidates.length > 0 && (
          <select
            // 선택하면 입력칸에 채워 확인 후 '추가'로 확정하는 방식 — 오선택으로 바로 등록되지 않게
            value=""
            onChange={(e) => e.target.value && setNewEmail(e.target.value)}
            className="ta-input"
            style={{ flexShrink: 0, width: 220 }}
            aria-label="알림 설정에 수기로 입력된 이메일 선택"
          >
            <option value="">알림 설정의 이메일 불러오기…</option>
            {candidates.map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        )}
        <input
          type="email"
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="example@gmail.com"
          className="ta-input"
          style={{ flex: 1, minWidth: 180 }}
        />
        <button onClick={add} disabled={adding || !newEmail.trim()} className="ta-btn" style={{ flexShrink: 0 }}>
          {adding ? '추가 중…' : '추가'}
        </button>
      </div>

      {allowed.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <p className="ta-prose text-body text-muted-foreground" style={{ margin: '0 0 6px' }}>
            외부 이메일 허용 목록 — 해제하면 계정·권한 설정은 남고 로그인만 막혀요.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {allowed.map((email) => (
              <div key={email} className="flex items-center justify-between gap-3 border-t border-border" style={{ paddingTop: 12, paddingBottom: 12 }}>
                <span className="break-all text-body text-foreground">{email}</span>
                <button
                  onClick={() => removeAllowed(email)}
                  className="text-muted-foreground hover:text-foreground"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, flexShrink: 0 }}
                >
                  허용 해제
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
