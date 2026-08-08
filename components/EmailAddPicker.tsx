'use client';

import { useEffect, useState } from 'react';

// 담당자 이메일 추가 UI — 드롭다운에서 팀 계정을 골라 즉시 추가하고,
// '＋ 직접 입력'을 고르면 수기 기입 칸으로 전환된다.
// 가든 설정(NotificationCenter)과 스탭밀 설정(TopicAssignees)이 공유한다.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 팀 전체 계정 이메일(대표·사전 등록 계정 포함) — /api/garden-tab-access 의 emails.
// 조회 실패 시 빈 목록 = 드롭다운에 '직접 입력'만 남으므로 기능이 죽지는 않는다.
export function useTeamEmails(): string[] {
  const [emails, setEmails] = useState<string[]>([]);
  useEffect(() => {
    fetch('/api/garden-tab-access', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => Array.isArray(j?.emails) && setEmails(j.emails))
      .catch(() => {});
  }, []);
  return emails;
}

const boxStyle: React.CSSProperties = { height: 30, width: 190, fontSize: 13 };

export default function EmailAddPicker({
  candidates,
  exclude,
  onAdd,
  busy,
  onError,
}: {
  candidates: string[]; // 드롭다운 후보 (useTeamEmails 결과)
  exclude: string[]; // 이미 담당자인 이메일 — 드롭다운에서 숨긴다
  onAdd: (email: string) => void; // 소문자 정규화·형식 검증이 끝난 이메일만 온다
  busy?: boolean;
  onError?: (message: string) => void;
}) {
  const [custom, setCustom] = useState(false);
  const [input, setInput] = useState('');

  const excluded = new Set(exclude.map((e) => e.toLowerCase()));
  const options = candidates.filter((e) => !excluded.has(e.toLowerCase()));

  const addTyped = () => {
    const email = input.trim().toLowerCase();
    if (!email || busy) return;
    if (!EMAIL_RE.test(email)) {
      onError?.('올바른 이메일을 입력하세요.');
      return;
    }
    setInput('');
    onAdd(email);
  };

  if (!custom) {
    return (
      <select
        // 선택 즉시 추가하고 placeholder 로 되돌아가는 일회성 선택 — 항상 '' 로 유지
        value=""
        disabled={busy}
        onChange={(e) => {
          const v = e.target.value;
          if (v === '__custom') setCustom(true);
          else if (v) onAdd(v);
        }}
        className="ta-input"
        style={boxStyle}
        aria-label="담당자 이메일 선택"
      >
        <option value="">이메일 추가…</option>
        {options.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
        <option value="__custom">＋ 직접 입력</option>
      </select>
    );
  }

  return (
    <>
      <input
        type="email"
        autoFocus
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && addTyped()}
        placeholder="이메일 직접 입력"
        className="ta-input"
        style={boxStyle}
      />
      <button
        onClick={addTyped}
        disabled={busy || !input.trim()}
        className="ta-btn"
        style={{ height: 30, paddingLeft: 10, paddingRight: 10, fontSize: 13 }}
      >
        추가
      </button>
      <button
        onClick={() => {
          setCustom(false);
          setInput('');
        }}
        className="ta-btn"
        style={{ height: 30, paddingLeft: 10, paddingRight: 10, fontSize: 13 }}
        title="팀 계정 목록에서 선택"
      >
        목록
      </button>
    </>
  );
}
