'use client';

import { useEffect, useState } from 'react';
import { GARDEN_TABS, GARDEN_TAB_KEYS } from '@/lib/garden/tabs';
import { SECTIONS, SECTION_KEYS } from '@/lib/access/sections';
import { TEAM_DOMAIN } from '@/lib/finance/access';

type UserRow = { id: string; email: string; tabs: string[] | null; sections: string[] | null };
type Kind = 'tabs' | 'sections';

// 페이지 접근 권한 — 사용자별로 상위 섹션과 가든 하위 탭을 토글로 켜고 끈다. (admin 전용)
// 전부 켜짐 = 제한 없음, 일부 끄면 허용 목록으로 저장되고 미들웨어가 서버에서 강제한다.
// 이메일 사전 등록: 계정을 미리 만들어 로그인 전에 권한을 걸어두고, 외부 이메일(gmail 등)은
// 허용 목록(finance.allowed_emails)에 함께 등록해 로그인을 연다.

function Toggle({
  on,
  disabled,
  onChange,
  label,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="shrink-0 rounded-full transition-colors"
      style={{
        width: 40,
        height: 22,
        padding: 2,
        border: '1px solid hsl(var(--border))',
        background: on ? 'hsl(var(--foreground))' : 'hsl(var(--muted))',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        className="block rounded-full transition-transform"
        style={{
          width: 16,
          height: 16,
          background: on ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))',
          transform: on ? 'translateX(18px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}

function Row({
  label,
  desc,
  on,
  disabled,
  onChange,
}: {
  label: string;
  desc?: string;
  on: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <div
      className="flex items-start justify-between gap-4 border-t border-border"
      style={{ paddingTop: 10, paddingBottom: 10 }}
    >
      <div style={{ minWidth: 0 }}>
        <div className={`text-[13px] ${on ? 'text-foreground' : 'text-muted-foreground'}`} style={{ fontWeight: 500 }}>
          {label}
        </div>
        {desc && (
          <div className="text-[12px] text-muted-foreground" style={{ marginTop: 2, lineHeight: 1.5 }}>
            {desc}
          </div>
        )}
      </div>
      <Toggle on={on} disabled={disabled} onChange={onChange} label={label} />
    </div>
  );
}

export default function GardenTabAccess({
  initial,
  initialAllowed,
}: {
  initial: UserRow[];
  initialAllowed: string[]; // 안정된 참조를 넘길 것 — 렌더마다 새 배열이면 동기화 이펙트가 무한 반복
}) {
  const [users, setUsers] = useState<UserRow[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  // 외부 이메일 허용 목록 + 사전 등록 폼 상태
  const [allowed, setAllowed] = useState<string[]>(initialAllowed);
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
      const fromTopics =
        topics.status === 'fulfilled'
          ? (Object.values(topics.value as Record<string, string[]>).flat() as string[])
          : [];
      const fromRecipients =
        rec.status === 'fulfilled'
          ? (((rec.value as { recipients?: { email: string }[] })?.recipients ?? []).map((r) => r.email) as string[])
          : [];
      setManualEmails(
        Array.from(new Set([...fromTopics, ...fromRecipients].map((e) => String(e).trim().toLowerCase()))).sort()
      );
    });
  }, []);

  // 이미 계정이 있거나 허용 목록에 있는 이메일은 후보에서 제외
  const registered = new Set([...users.map((u) => u.email.toLowerCase()), ...allowed.map((e) => e.toLowerCase())]);
  const preRegCandidates = manualEmails.filter((e) => !registered.has(e));

  useEffect(() => {
    setUsers(initial);
  }, [initial]);
  useEffect(() => {
    setAllowed(initialAllowed);
  }, [initialAllowed]);

  const allowedSet = (u: UserRow, kind: Kind) =>
    new Set(u[kind] ?? (kind === 'tabs' ? GARDEN_TAB_KEYS : SECTION_KEYS));

  const toggle = async (u: UserRow, kind: Kind, key: string) => {
    const next = allowedSet(u, kind);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const all = kind === 'tabs' ? GARDEN_TAB_KEYS : SECTION_KEYS;
    const value = all.filter((k) => next.has(k));
    setBusyId(u.id);
    setError('');
    try {
      const res = await fetch('/api/garden-tab-access', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: u.id, email: u.email, [kind]: value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '저장에 실패했습니다.');
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, tabs: json.tabs, sections: json.sections } : x)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const summary = (u: UserRow) => {
    const s = u.sections === null ? SECTION_KEYS.length : u.sections.length;
    const t = u.tabs === null ? GARDEN_TAB_KEYS.length : u.tabs.length;
    if (u.sections === null && u.tabs === null) return '전체 접근';
    return `섹션 ${s}/${SECTION_KEYS.length} · 가든 탭 ${t}/${GARDEN_TAB_KEYS.length}`;
  };

  // 외부 계정(비 팀 도메인) 여부 — 허용 목록에 없으면 로그인 자체가 차단된 상태
  const isExternal = (email: string) => !email.toLowerCase().endsWith('@' + TEAM_DOMAIN);
  const externalBadge = (email: string) =>
    !isExternal(email) ? null : allowed.includes(email.toLowerCase()) ? ' · 외부(로그인 허용)' : ' · 외부(로그인 차단)';

  // 이메일 사전 등록 — 계정 생성(또는 기존 계정 확인) 후 목록에 올리고 바로 권한 설정을 연다
  const addEmail = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email || adding) return;
    setAdding(true);
    setError('');
    try {
      const res = await fetch('/api/garden-tab-access', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '추가에 실패했습니다.');
      const u = json.user as UserRow;
      setUsers((prev) => (prev.some((x) => x.id === u.id) ? prev : [...prev, u].sort((a, b) => a.email.localeCompare(b.email))));
      if (json.allowed && !allowed.includes(email)) setAllowed((prev) => [...prev, email].sort());
      setNewEmail('');
      setOpenId(u.id); // 바로 권한을 걸 수 있게 펼쳐준다
    } catch (e) {
      setError(e instanceof Error ? e.message : '추가에 실패했습니다.');
    } finally {
      setAdding(false);
    }
  };

  // 계정 완전 삭제 — 잘못 등록한 계정 정리. auth 계정·권한 행·허용 목록을 함께 지운다.
  const deleteAccount = async (u: UserRow) => {
    const blockNote = isExternal(u.email)
      ? '\n외부 계정이라 허용 목록에서도 빠져 로그인이 차단됩니다.'
      : '\n팀 도메인 계정은 구글 로그인하면 다시 생성되니, 완전 차단은 워크스페이스에서 계정을 정지하세요.';
    if (!confirm(`'${u.email}' 계정을 삭제할까요?\n권한 설정도 함께 지워지며 되돌릴 수 없습니다.${blockNote}`)) return;
    setBusyId(u.id);
    setError('');
    try {
      const res = await fetch('/api/garden-tab-access', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: u.id, purge: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '삭제에 실패했습니다.');
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
      setAllowed((prev) => prev.filter((e) => e !== u.email.toLowerCase()));
      setOpenId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  // 외부 이메일 허용 해제 — 계정·권한 설정은 남고 로그인만 다시 막힌다
  const removeAllowed = async (email: string) => {
    setError('');
    try {
      const res = await fetch('/api/garden-tab-access', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '삭제에 실패했습니다.');
      setAllowed((prev) => prev.filter((e) => e !== email));
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제에 실패했습니다.');
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card/40" style={{ padding: 16 }}>
      <h2 className="text-[14px] font-medium" style={{ margin: '0 0 4px' }}>
        페이지 접근 권한
      </h2>
      <p className="text-[12px] text-muted-foreground" style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
        계정별로 접근할 수 있는 화면을 지정합니다. 끈 항목은 나비에서 숨겨지고, 주소로 직접 접근해도 서버에서
        차단됩니다. 대표 계정은 항상 전체 접근이라 목록에 없습니다.
      </p>
      {error && (
        <p className="text-[12px]" style={{ color: 'hsl(0 72% 45%)', margin: '0 0 8px' }}>
          {error}
        </p>
      )}
      {users.length === 0 && (
        <p className="text-[13px] text-muted-foreground" style={{ margin: 0 }}>
          표시할 사용자가 없습니다.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {users.map((u) => {
          const open = openId === u.id;
          const sec = allowedSet(u, 'sections');
          const tab = allowedSet(u, 'tabs');
          const gardenOn = sec.has('garden');
          return (
            <div key={u.id} className="rounded-lg bg-muted/40" style={{ padding: 12 }}>
              <button
                onClick={() => setOpenId(open ? null : u.id)}
                className="flex w-full items-center justify-between gap-3 text-left"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <span style={{ minWidth: 0 }}>
                  <span className="block text-[13px] font-medium text-foreground">{u.email}</span>
                  <span className="block text-[12px] text-muted-foreground" style={{ marginTop: 2 }}>
                    {summary(u)}
                    {externalBadge(u.email)}
                    {busyId === u.id && ' · 저장 중…'}
                  </span>
                </span>
                <span className="text-[12px] text-muted-foreground" style={{ flexShrink: 0 }}>
                  {open ? '접기 ▲' : '권한 설정 ▼'}
                </span>
              </button>

              {open && (
                <div style={{ marginTop: 12 }}>
                  <p className="ta-label" style={{ marginBottom: 0 }}>
                    상위 메뉴
                  </p>
                  {/* 2열 그리드 — 목록이 길어 한 화면에 더 많이 보이게. 좁은 화면에선 1열로 접힘 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', columnGap: 28 }}>
                    {SECTIONS.map((s) => (
                      <Row
                        key={s.key}
                        label={s.label}
                        desc={s.desc}
                        on={sec.has(s.key)}
                        disabled={busyId === u.id}
                        onChange={() => toggle(u, 'sections', s.key)}
                      />
                    ))}
                  </div>

                  <p className="ta-label" style={{ marginTop: 16, marginBottom: 0 }}>
                    Garden Service 하위 탭
                  </p>
                  {!gardenOn && (
                    <p className="text-[12px] text-muted-foreground" style={{ margin: '4px 0 0' }}>
                      Garden Service 접근이 꺼져 있어 하위 탭 설정은 적용되지 않습니다.
                    </p>
                  )}
                  <div
                    style={{
                      opacity: gardenOn ? 1 : 0.45,
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                      columnGap: 28,
                    }}
                  >
                    {GARDEN_TABS.map((t) => (
                      <Row
                        key={t.key}
                        label={t.label}
                        desc={t.desc}
                        on={tab.has(t.key)}
                        disabled={busyId === u.id || !gardenOn}
                        onChange={() => toggle(u, 'tabs', t.key)}
                      />
                    ))}
                  </div>

                  {/* 계정 삭제 — 잘못 등록한 계정 정리. 외부 계정은 허용 목록에서도 빠져 로그인 차단 */}
                  <div
                    className="border-t border-border"
                    style={{ marginTop: 16, paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                  >
                    <p className="text-[12px] text-muted-foreground" style={{ margin: 0, lineHeight: 1.5 }}>
                      {isExternal(u.email)
                        ? '삭제하면 계정·권한이 지워지고 허용 목록에서도 빠져 로그인이 차단됩니다.'
                        : '삭제해도 팀 도메인 계정은 구글 로그인하면 다시 생성됩니다(그때는 전체 접근). 완전 차단은 워크스페이스에서 계정을 정지하세요.'}
                    </p>
                    <button
                      onClick={() => deleteAccount(u)}
                      disabled={busyId === u.id}
                      className="rounded-md border"
                      style={{
                        flexShrink: 0,
                        height: 30,
                        paddingLeft: 12,
                        paddingRight: 12,
                        fontSize: 12,
                        cursor: 'pointer',
                        background: 'none',
                        borderColor: 'hsl(0 72% 45% / 0.4)',
                        color: 'hsl(0 72% 45%)',
                      }}
                    >
                      계정 삭제
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 이메일 사전 등록 — 로그인한 적 없는 인원도 계정을 미리 만들어 권한을 걸어둔다 */}
      <div style={{ marginTop: 16 }}>
        <p className="ta-label" style={{ marginBottom: 4 }}>
          이메일로 계정 추가 (사전 등록)
        </p>
        <p className="text-[12px] text-muted-foreground" style={{ margin: '0 0 8px', lineHeight: 1.6 }}>
          아직 로그인한 적 없는 인원도 이메일로 미리 등록해 권한을 걸어둘 수 있어요. @{TEAM_DOMAIN} 외
          이메일(gmail 등)은 허용 목록에 함께 등록돼 로그인이 열립니다. 같은 이메일로 구글 로그인하면
          등록된 계정에 자동 연결돼요. <b>권한을 따로 끄지 않으면 전체 접근</b>이니, 추가 직후 열리는
          권한 설정에서 필요한 화면만 켜두세요.
        </p>
        <div style={{ display: 'flex', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
          {preRegCandidates.length > 0 && (
            <select
              // 선택하면 입력칸에 채워 확인 후 '추가'로 확정하는 방식 — 오선택으로 바로 등록되지 않게
              value=""
              onChange={(e) => e.target.value && setNewEmail(e.target.value)}
              className="ta-input"
              style={{ flexShrink: 0, width: 220 }}
              aria-label="알림 설정에 수기로 입력된 이메일 선택"
            >
              <option value="">알림 설정의 이메일 불러오기…</option>
              {preRegCandidates.map((e) => (
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
            onKeyDown={(e) => e.key === 'Enter' && addEmail()}
            placeholder="example@gmail.com"
            className="ta-input"
            style={{ flex: 1, minWidth: 180 }}
          />
          <button onClick={addEmail} disabled={adding || !newEmail.trim()} className="ta-btn" style={{ flexShrink: 0 }}>
            {adding ? '추가 중…' : '추가'}
          </button>
        </div>

        {allowed.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <p className="text-[12px] text-muted-foreground" style={{ margin: '0 0 6px' }}>
              외부 이메일 허용 목록 — 해제하면 계정·권한 설정은 남고 로그인만 막혀요.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {allowed.map((email) => (
                <div key={email} className="flex items-center justify-between gap-3 border-t border-border" style={{ paddingTop: 6, paddingBottom: 6 }}>
                  <span className="break-all text-[13px] text-foreground">{email}</span>
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
    </section>
  );
}
