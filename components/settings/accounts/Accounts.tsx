'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { STORES, type StoreId } from '@/lib/types';
import type { ProfileRole } from '@/lib/account/roles';
import { TEAM_DOMAIN } from '@/lib/finance/access';
import AccountRow, { KIND_KEYS, allowedSet } from './AccountRow';
import RoleManager from './RoleManager';
import EmailPreRegister from './EmailPreRegister';
import { mergeAccounts, type Account, type AccessKind, type ProfileRow, type UserRow } from './types';

// 설정 > 계정 — 간편 계정(이름+6자리)과 이메일 계정을 한 목록에서 관리한다 (2026-11-03 대표 지시로
// 이전의 '간편 계정' 표 + '페이지 접근 권한' 목록을 통합). 줄을 펼치면 기본 정보와 볼 수 있는 화면을 함께 바꾼다.
// 발급·초기화 때 나오는 6자리 비밀번호는 그 자리에서 본인에게 전달하고, 첫 로그인 때 본인이 바꾼다.
// 가입 신청(로그인 화면에서 본인이 신청)은 '가입 신청 대기'에 모이고, 역할·지점을 지정해 승인해야 로그인이 열린다.

type Draft = { role: string; stores: StoreId[] };
type Filter = 'all' | 'simple' | 'email';

async function call(url: string, method: 'POST' | 'PATCH' | 'DELETE', payload: Record<string, unknown>) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || '요청에 실패했습니다.');
  return body;
}
const accountsApi = (method: 'POST' | 'PATCH' | 'DELETE', payload: Record<string, unknown>) => call('/api/simple-accounts', method, payload);

export default function Accounts() {
  const [profiles, setProfiles] = useState<ProfileRow[] | null>(null);
  const [roles, setRoles] = useState<ProfileRole[]>([]);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  // 발급 폼
  const [name, setName] = useState('');
  const [role, setRole] = useState('staff');
  const [stores, setStores] = useState<StoreId[]>(['pangyo']);
  // 방금 발급·초기화된 비밀번호 — 화면을 떠나면 다시 볼 수 없다
  const [issued, setIssued] = useState<{ name: string; pin: string } | null>(null);
  // 승인 대기 행별 역할·지점 선택(승인 전까지 화면에만 있음)
  const [pendingDraft, setPendingDraft] = useState<Record<string, Draft>>({});

  const loadProfiles = useCallback(async () => {
    const res = await fetch('/api/simple-accounts', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body?.error || '목록을 불러오지 못했습니다.');
    setProfiles(body.profiles as ProfileRow[]);
    setRoles((body.roles as ProfileRole[]) ?? []);
  }, []);
  const loadUsers = useCallback(async () => {
    const j = await fetch('/api/garden-tab-access', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setUsers(j?.isAdmin && Array.isArray(j.users) ? j.users : []);
    if (Array.isArray(j?.allowedEmails)) setAllowed(j.allowedEmails);
  }, []);
  const loadAll = useCallback(() => Promise.all([loadProfiles(), loadUsers()]), [loadProfiles, loadUsers]);
  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // 프로필·계정을 바꾸는 요청 — 끝나면 두 목록을 다시 불러 한 줄에 반영
  const run = async (fn: () => Promise<unknown>, id?: string) => {
    setBusy(true);
    if (id) setBusyId(id);
    setError('');
    try {
      await fn();
      await loadAll();
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청에 실패했습니다.');
    } finally {
      setBusy(false);
      setBusyId(null);
    }
  };

  const accounts = useMemo(() => (users && profiles ? mergeAccounts(users, profiles) : null), [users, profiles]);
  const pending = (profiles ?? []).filter((r) => r.status === 'pending');
  const shown = (accounts ?? []).filter((a) => filter === 'all' || a.kind === filter);

  // 섹션·탭 토글 — 권한 행만 바뀌므로 목록 전체를 다시 읽지 않고 그 줄만 갱신
  const toggleAccess = async (a: Account, kind: AccessKind, key: string) => {
    const u = a.user;
    if (!u) return;
    const next = allowedSet(u, kind);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setBusyId(a.id);
    setError('');
    try {
      const json = await call('/api/garden-tab-access', 'PATCH', { userId: u.id, email: u.email, [kind]: KIND_KEYS[kind].filter((k) => next.has(k)) });
      setUsers((prev) => (prev ?? []).map((x) => (x.id === u.id ? { ...x, tabs: json.tabs, sections: json.sections, studioTabs: json.studioTabs } : x)));
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const toggleStore = (a: Account, id: StoreId) => {
    const p = a.profile!;
    const next = p.stores.includes(id) ? p.stores.filter((s) => s !== id) : [...p.stores, id];
    if (next.length === 0) return;
    void run(() => accountsApi('PATCH', { userId: p.user_id, stores: next }), a.id);
  };
  const resetPin = (a: Account) =>
    run(async () => {
      const body = await accountsApi('PATCH', { userId: a.id, resetPin: true });
      setIssued({ name: a.title, pin: body.pin });
    }, a.id);

  // 계정 삭제 — 간편 로그인 계정은 간편 계정 API(교육 기록까지 정리), 그 외(이메일·명부만 있는 계정)는
  // 로그인 계정 자체를 지운다(프로필은 cascade). 명부 계정을 프로필만 지우면 로그인 계정이 남는다(이진희 사례, 2026-11-03).
  const remove = (a: Account) => {
    const external = a.kind === 'email' && !a.title.toLowerCase().endsWith('@' + TEAM_DOMAIN);
    const note =
      a.kind === 'simple'
        ? '\n교육 요청·기록도 함께 지워집니다. 퇴사자라면 지우지 말고 스케줄 › 직원 명부에서 재직을 꺼 주세요.'
        : external
          ? '\n외부 계정이라 허용 목록에서도 빠져 로그인이 차단됩니다.'
          : '\n팀 도메인 계정은 구글 로그인하면 다시 생성되니, 완전 차단은 워크스페이스에서 계정을 정지하세요.';
    if (!window.confirm(`'${a.title}' 계정을 삭제할까요? 권한 설정도 함께 지워지며 되돌릴 수 없습니다.${note}`)) return;
    void run(async () => {
      if (a.profile?.simple_login || !a.user) await accountsApi('DELETE', { userId: a.id });
      else await call('/api/garden-tab-access', 'DELETE', { userId: a.id, purge: true });
      setOpenId(null);
    }, a.id);
  };

  const create = () =>
    run(async () => {
      const body = await accountsApi('POST', { name, role, stores });
      setIssued({ name: body.name, pin: body.pin });
      setName('');
    });

  const draftOf = (r: ProfileRow): Draft => pendingDraft[r.user_id] ?? { role: 'staff', stores: [] };
  const setDraft = (r: ProfileRow, d: Partial<Draft>) => setPendingDraft((cur) => ({ ...cur, [r.user_id]: { ...draftOf(r), ...d } }));
  const approve = (r: ProfileRow) => {
    const d = draftOf(r);
    if (d.stores.length === 0) return setError(`${r.display_name}: 지점을 하나 이상 선택하세요.`);
    void run(() => accountsApi('PATCH', { userId: r.user_id, approve: true, role: d.role, stores: d.stores }));
  };
  const reject = (r: ProfileRow) => {
    if (!window.confirm(`${r.display_name}의 가입 신청을 거절할까요? 계정이 삭제됩니다.`)) return;
    void run(() => accountsApi('DELETE', { userId: r.user_id }));
  };

  const roleSelect = (value: string, onChange: (v: string) => void, className = 'ta-input h-8') => (
    <select className={className} value={value} disabled={busy} onChange={(e) => onChange(e.target.value)}>
      {roles.map((r) => (
        <option key={r.key} value={r.key}>
          {r.label}
          {r.canManage ? ' · 운영' : ''}
        </option>
      ))}
    </select>
  );
  const storeToggles = (selected: StoreId[], onToggle: (id: StoreId) => void) => (
    <div className="inline-flex gap-1 ta-seg">
      {STORES.map((s) => (
        <button
          key={s.id}
          type="button"
          disabled={busy}
          onClick={() => onToggle(s.id)}
          className={`ta-seg-item px-2.5 py-1 text-body transition-colors ${selected.includes(s.id) ? 'ta-seg-on' : ''}`}
        >
          {s.short}
        </button>
      ))}
    </div>
  );
  const flip = (list: StoreId[], id: StoreId) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  // 외부(비 팀 도메인) 계정 — 허용 목록에 없으면 로그인 자체가 차단된 상태
  const externalBadge = (a: Account) => {
    const email = a.user?.email.toLowerCase();
    if (!email || email.endsWith('@' + TEAM_DOMAIN)) return null;
    return allowed.includes(email) ? ' · 외부(로그인 허용)' : ' · 외부(로그인 차단)';
  };
  const registered = new Set([...(users ?? []).map((u) => u.email.toLowerCase()), ...allowed.map((e) => e.toLowerCase())]);

  return (
    <section className="min-w-0 space-y-10">
      <div>
        <h2 className="text-title font-medium" style={{ margin: '0 0 4px' }}>계정</h2>
        <p className="ta-prose text-body text-muted-foreground">
          팀이 쓰는 모든 로그인 계정을 한곳에서 관리해요. <b>간편 계정</b>은 이름 + 숫자 6자리로, <b>이메일 계정</b>은 이메일로 로그인해요.
          줄을 펼치면 그 사람의 기본 정보와 볼 수 있는 화면을 함께 바꿀 수 있어요. 끈 화면은 나비에서 숨겨지고 주소로 들어와도 서버에서
          막혀요. 대표 계정은 항상 전체 접근이라 목록에 없어요.
        </p>
      </div>

      {/* 간편 계정 발급 — 기본 권한은 가든 섹션의 교육 탭, 발급 후 줄을 펼쳐 넓힌다 */}
      <div>
        <p className="ta-label">간편 계정 발급</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block">
            <span className="ta-label">이름</span>
            <input className="ta-input" value={name} maxLength={12} placeholder="이름" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="block">
            <span className="ta-label">역할</span>
            {roleSelect(role, setRole, 'ta-input')}
          </label>
          <div>
            <span className="ta-label">지점</span>
            {storeToggles(stores, (id) => setStores((cur) => flip(cur, id)))}
          </div>
          <button className="ta-btn-primary" disabled={busy || !name.trim() || stores.length === 0} onClick={create}>
            {busy ? '처리 중…' : '계정 발급'}
          </button>
        </div>
      </div>

      {issued && (
        <div className="space-y-1 rounded-md bg-muted/40 px-4 py-3 text-body">
          <p>
            <b>{issued.name}</b>의 임시 비밀번호 <span className="tabular text-display">{issued.pin}</span>
          </p>
          <p className="ta-prose text-muted-foreground">
            지금 본인에게 알려주세요. 이 화면을 떠나면 다시 볼 수 없고, 첫 로그인 때 본인이 새 비밀번호로 바꿉니다.{' '}
            <button className="underline underline-offset-2" onClick={() => setIssued(null)}>확인했어요</button>
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <p className="ta-label">
            가입 신청 대기 <span className="tabular">{pending.length}명</span> — 역할·지점을 지정해 승인하면 바로 로그인할 수 있고, 이메일을 적었으면 승인 안내 메일이 가요
          </p>
          <ul className="space-y-3">
            {pending.map((r) => {
              const d = draftOf(r);
              return (
                <li key={r.user_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md px-4 py-3 text-body" style={{ background: 'hsl(43 100% 95%)' }}>
                  <span className="font-medium">{r.display_name}</span>
                  <span className="text-caption text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} 신청
                  </span>
                  <span className="text-caption text-muted-foreground">{r.contact_email ?? '이메일 미기재'}</span>
                  {roleSelect(d.role, (v) => setDraft(r, { role: v }))}
                  {storeToggles(d.stores, (id) => setDraft(r, { stores: flip(d.stores, id) }))}
                  <button className="ta-btn-primary h-8" disabled={busy || d.stores.length === 0} onClick={() => approve(r)}>
                    승인
                  </button>
                  <button className="text-caption text-muted-foreground underline underline-offset-2" disabled={busy} onClick={() => reject(r)}>
                    거절
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center justify-between gap-3" style={{ marginBottom: 14 }}>
          <p className="ta-label" style={{ margin: 0 }}>
            계정 목록{accounts && <span className="tabular"> · {accounts.length}</span>}
          </p>
          <div className="inline-flex gap-1 ta-seg">
            {(
              [
                ['all', '전체'],
                ['simple', '간편'],
                ['email', '이메일'],
              ] as [Filter, string][]
            ).map(([k, label]) => (
              <button key={k} onClick={() => setFilter(k)} className={`ta-seg-item px-2.5 py-1 text-body transition-colors ${filter === k ? 'ta-seg-on' : ''}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {error && <p className="ta-error text-body" style={{ margin: '0 0 12px' }}>{error}</p>}
        {accounts === null ? (
          <p className="ta-prose text-body text-muted-foreground">불러오는 중…</p>
        ) : shown.length === 0 ? (
          <p className="ta-prose text-body text-muted-foreground">표시할 계정이 없어요.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {shown.map((a) => (
              <AccountRow
                key={a.id}
                a={a}
                open={openId === a.id}
                busy={busyId === a.id}
                roles={roles}
                external={externalBadge(a)}
                onToggleOpen={() => setOpenId(openId === a.id ? null : a.id)}
                onAccess={(kind, key) => toggleAccess(a, kind, key)}
                onRole={(r) => void run(() => accountsApi('PATCH', { userId: a.id, role: r }), a.id)}
                onStore={(id) => toggleStore(a, id)}
                onComments={(on) => void run(() => accountsApi('PATCH', { userId: a.id, canViewComments: on }), a.id)}
                onResetPin={() => void resetPin(a)}
                onDelete={() => remove(a)}
              />
            ))}
          </div>
        )}
      </div>

      <EmailPreRegister
        registered={registered}
        allowed={allowed}
        onError={setError}
        onAdded={(json, email) => {
          const u = json.user as UserRow;
          setUsers((prev) => {
            const list = prev ?? [];
            return list.some((x) => x.id === u.id) ? list : [...list, u];
          });
          if (json.allowed && !allowed.includes(email)) setAllowed((prev) => [...prev, email].sort());
          setFilter('all');
          setOpenId(u.id); // 바로 권한을 걸 수 있게 펼쳐준다
        }}
        onAllowedRemoved={(email) => setAllowed((prev) => prev.filter((e) => e !== email))}
      />

      <RoleManager roles={roles} usedBy={(key) => (profiles ?? []).filter((r) => r.role === key).length} busy={busy} run={run} />
    </section>
  );
}
