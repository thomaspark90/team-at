'use client';

import { useState } from 'react';
import { STORES, type StoreId } from '@/lib/types';
import type { ProfileRole } from '@/lib/account/roles';
import AccountInfo from './AccountInfo';
import PermissionMatrix from './PermissionMatrix';
import RoleManager from './RoleManager';
import EmailPreRegister from './EmailPreRegister';
import { type Account, type ProfileRow, type UserRow } from './types';
import { accountsApi, useAccountsAdmin, type AccountsCtl } from './useAccountsAdmin';

// 설정 > 계정 — 간편 계정(이름+6자리)과 이메일 계정을 한 표에서 관리한다 (2026-11-03 통합).
// 2026-11-20 대표 지시로 줄을 펼치는 방식 → '사람 × 권한' 표(PermissionMatrix): 첫 열 인원, 둘째 열부터 권한.
// 이름을 누르면 그 줄 아래에 기본 정보(역할·지점·비밀번호·삭제)가 펼쳐진다.
// 발급·초기화 때 나오는 6자리 비밀번호는 그 자리에서 본인에게 전달하고, 첫 로그인 때 본인이 바꾼다.
// 가입 신청(로그인 화면에서 본인이 신청)은 '가입 신청 대기'에 모이고, 역할·지점을 지정해 승인해야 로그인이 열린다.

type Draft = { role: string; stores: StoreId[] };
type Filter = 'all' | 'simple' | 'email';

// 화면 본체 — 데이터와 저장 동작(ctl)은 useAccountsAdmin 이 갖고, 직원 명부도 같은 ctl 로 이 화면을 아래쪽에 붙여 쓴다.
// hub = 직원 명부 아래에 붙을 때: 명부에 연결된 계정(excludeIds)은 위 표에 있으므로 빼고, 가입 신청은 명부 위쪽 칸에서 처리하므로 숨긴다.
export default function Accounts() {
  const ctl = useAccountsAdmin();
  return <AccountsView ctl={ctl} />;
}

export function AccountsView({ ctl, hub = false, excludeIds }: { ctl: AccountsCtl; hub?: boolean; excludeIds?: Set<string> }) {
  const { profiles, roles, users, setUsers, allowed, setAllowed, busy, busyId, error, setError, issued, setIssued, run, accounts, toggleAccess, toggleStore, resetPin } = ctl;
  const pending = hub ? [] : ctl.pending;
  const [openId, setOpenId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  // 발급 폼
  const [name, setName] = useState('');
  const [role, setRole] = useState('staff');
  const [stores, setStores] = useState<StoreId[]>(['pangyo']);
  // 승인 대기 행별 역할·지점 선택(승인 전까지 화면에만 있음)
  const [pendingDraft, setPendingDraft] = useState<Record<string, Draft>>({});

  const shown = (accounts ?? []).filter((a) => (filter === 'all' || a.kind === filter) && !excludeIds?.has(a.id));

  const remove = (a: Account) => ctl.removeAccount(a, () => setOpenId(null));

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

  const externalBadge = ctl.externalBadge;
  const registered = new Set([...(users ?? []).map((u) => u.email.toLowerCase()), ...allowed.map((e) => e.toLowerCase())]);

  return (
    <section className="min-w-0 space-y-10">
      <div>
        <h2 className="text-title font-medium" style={{ margin: '0 0 4px' }}>{hub ? '명부에 없는 계정 · 계정 도구' : '계정'}</h2>
        {hub && (
          <p className="ta-prose text-body text-muted-foreground" style={{ marginBottom: 6 }}>
            직원 명부에 연결되지 않은 로그인 계정(대표 · 외부 담당자 등)의 권한과, 계정 발급 · 사전 등록 · 역할 관리입니다. 명부에 연결된 사람의 권한은 위 표의 「업무 지정」 · 「권한」 묶음에서 봅니다.
          </p>
        )}
        <p className="ta-prose text-body text-muted-foreground">
          팀이 쓰는 모든 로그인 계정을 한곳에서 관리해요. <b>간편 계정</b>은 이름 + 숫자 6자리로, <b>이메일 계정</b>은 이메일로 로그인해요.
          아래 표는 한 줄이 한 사람, 한 칸이 권한 하나예요 — 칸을 누르면 바로 저장되고, 이름을 누르면 역할·지점·비밀번호를 바꿀 수 있어요.
          끈 화면은 나비에서 숨겨지고 주소로 들어와도 서버에서 막혀요. 대표 계정은 항상 전체 접근이에요.
        </p>
      </div>

      {/* 간편 계정 발급 — 기본 권한은 SIMPLE_ACCOUNT_TABS, 발급 후 표에서 넓힌다 */}
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
            계정 목록{accounts && <span className="tabular"> · {hub ? shown.length : accounts.length}</span>}
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
          <PermissionMatrix
            accounts={shown}
            roles={roles}
            busyId={busyId}
            openId={openId}
            onToggleOpen={(id) => setOpenId(openId === id ? null : id)}
            onAccess={(a, kind, key) => void toggleAccess(a, kind, key)}
            onComments={(a, on) => void run(() => accountsApi('PATCH', { userId: a.id, canViewComments: on }), a.id)}
            externalBadge={externalBadge}
            onError={setError}
            renderInfo={(a) => (
              <AccountInfo
                a={a}
                busy={busyId === a.id}
                roles={roles}
                onRole={(r) => void run(() => accountsApi('PATCH', { userId: a.id, role: r }), a.id)}
                onStore={(id) => toggleStore(a, id)}
                onResetPin={() => void resetPin(a)}
                onDelete={() => remove(a)}
              />
            )}
          />
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
          setOpenId(u.id); // 새 계정 줄을 펼쳐 어디 생겼는지 보이게
        }}
        onAllowedRemoved={(email) => setAllowed((prev) => prev.filter((e) => e !== email))}
      />

      <RoleManager roles={roles} usedBy={(key) => (profiles ?? []).filter((r) => r.role === key).length} busy={busy} run={run} />
    </section>
  );
}
