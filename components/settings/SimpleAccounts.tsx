'use client';

import { useCallback, useEffect, useState } from 'react';
import { STORES, type StoreId } from '@/lib/types';
import type { ProfileRole } from '@/lib/account/roles';

// 간편 계정 — 이름·지점·역할로 발급. 발급·초기화 때 나오는 6자리 비밀번호는
// 그 자리에서 본인에게 전달하고, 첫 로그인 때 본인이 바꾼다. 발급 기본 권한은 가든 섹션 + 교육 탭.
// 가입 신청(로그인 화면에서 본인이 이름·비밀번호 입력)은 '승인 대기'에 모이고, 역할·지점을 지정해 승인해야 로그인이 열린다.
// 역할 목록은 대표가 직접 추가·편집(finance.profile_roles) — 역할마다 '교육 운영 권한' 스위치 하나.

type ProfileRow = {
  user_id: string;
  display_name: string;
  role: string;
  stores: StoreId[];
  simple_login: boolean;
  pin_reset_required: boolean;
  locked_until: string | null;
  status: 'pending' | 'active';
  created_at: string;
  contact_email: string | null;
};

type Draft = { role: string; stores: StoreId[] };

const storeShort = (id: string) => STORES.find((s) => s.id === id)?.short ?? id;

export default function SimpleAccounts() {
  const [rows, setRows] = useState<ProfileRow[] | null>(null);
  const [roles, setRoles] = useState<ProfileRole[]>([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState('staff');
  const [stores, setStores] = useState<StoreId[]>(['pangyo']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // 방금 발급·초기화된 비밀번호 — 화면을 떠나면 다시 볼 수 없다
  const [issued, setIssued] = useState<{ name: string; pin: string } | null>(null);
  // 승인 대기 행별 역할·지점 선택(승인 전까지 화면에만 있음)
  const [pendingDraft, setPendingDraft] = useState<Record<string, Draft>>({});
  // 역할 관리
  const [rolesOpen, setRolesOpen] = useState(false);
  const [newRole, setNewRole] = useState('');
  const [newRoleManage, setNewRoleManage] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/simple-accounts', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body?.error || '목록을 불러오지 못했습니다.');
    setRows(body.profiles as ProfileRow[]);
    setRoles((body.roles as ProfileRole[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const call = async (url: string, method: 'POST' | 'PATCH' | 'DELETE', payload: Record<string, unknown>) => {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || '요청에 실패했습니다.');
    return body;
  };
  const accounts = (method: 'POST' | 'PATCH' | 'DELETE', payload: Record<string, unknown>) => call('/api/simple-accounts', method, payload);
  const roleApi = (method: 'POST' | 'PATCH' | 'DELETE', payload: Record<string, unknown>) => call('/api/simple-accounts/roles', method, payload);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const roleLabel = (key: string) => roles.find((r) => r.key === key)?.label ?? key;
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

  const create = () =>
    run(async () => {
      const body = await accounts('POST', { name, role, stores });
      setIssued({ name: body.name, pin: body.pin });
      setName('');
    });
  const resetPin = (r: ProfileRow) =>
    run(async () => {
      const body = await accounts('PATCH', { userId: r.user_id, resetPin: true });
      setIssued({ name: r.display_name, pin: body.pin });
    });
  const setRoleOf = (r: ProfileRow, next: string) => run(() => accounts('PATCH', { userId: r.user_id, role: next }).then(() => {}));
  const toggleStore = (r: ProfileRow, id: StoreId) => {
    const next = r.stores.includes(id) ? r.stores.filter((s) => s !== id) : [...r.stores, id];
    if (next.length === 0) return;
    void run(() => accounts('PATCH', { userId: r.user_id, stores: next }).then(() => {}));
  };

  const draftOf = (r: ProfileRow): Draft => pendingDraft[r.user_id] ?? { role: 'staff', stores: [] };
  const setDraft = (r: ProfileRow, d: Partial<Draft>) => setPendingDraft((cur) => ({ ...cur, [r.user_id]: { ...draftOf(r), ...d } }));
  const approve = (r: ProfileRow) => {
    const d = draftOf(r);
    if (d.stores.length === 0) return setError(`${r.display_name}: 지점을 하나 이상 선택하세요.`);
    void run(() => accounts('PATCH', { userId: r.user_id, approve: true, role: d.role, stores: d.stores }).then(() => {}));
  };
  const reject = (r: ProfileRow) => {
    if (!window.confirm(`${r.display_name}의 가입 신청을 거절할까요? 계정이 삭제됩니다.`)) return;
    void run(() => accounts('DELETE', { userId: r.user_id }).then(() => {}));
  };
  const remove = (r: ProfileRow) => {
    if (!window.confirm(`${r.display_name} 계정을 삭제할까요? 교육 요청·기록도 함께 지워집니다.`)) return;
    void run(() => accounts('DELETE', { userId: r.user_id }).then(() => {}));
  };

  const addRole = () =>
    run(async () => {
      await roleApi('POST', { label: newRole, canManage: newRoleManage });
      setNewRole('');
      setNewRoleManage(false);
    });
  const renameRole = (r: ProfileRole) => {
    const label = window.prompt(`'${r.label}' 역할의 새 이름`, r.label);
    if (label === null || label.trim() === '' || label.trim() === r.label) return;
    void run(() => roleApi('PATCH', { key: r.key, label: label.trim() }).then(() => {}));
  };
  const toggleRoleManage = (r: ProfileRole) => run(() => roleApi('PATCH', { key: r.key, canManage: !r.canManage }).then(() => {}));
  const deleteRole = (r: ProfileRole) => {
    if (!window.confirm(`'${r.label}' 역할을 삭제할까요?`)) return;
    void run(() => roleApi('DELETE', { key: r.key }).then(() => {}));
  };

  const pending = (rows ?? []).filter((r) => r.status === 'pending');
  const active = (rows ?? []).filter((r) => r.status !== 'pending');
  const usedBy = (key: string) => (rows ?? []).filter((r) => r.role === key).length;

  const storeToggles = (selected: StoreId[], onToggle: (id: StoreId) => void, size: 'sm' | 'md' = 'sm') => (
    <div className={size === 'md' ? 'flex gap-2' : 'flex gap-1'}>
      {STORES.map((s) => {
        const on = selected.includes(s.id);
        return (
          <button
            key={s.id}
            type="button"
            disabled={busy}
            onClick={() => onToggle(s.id)}
            className={
              size === 'md'
                ? `ta-btn ${on ? 'bg-primary text-primary-foreground hover:opacity-90' : ''}`
                : `rounded-md border px-2 py-0.5 text-[11px] ${on ? 'border-foreground' : 'border-border text-muted-foreground'}`
            }
          >
            {s.short}
          </button>
        );
      })}
    </div>
  );

  return (
    <section className="min-w-0 space-y-8">
      <div>
        <h2 className="text-[15px] font-medium" style={{ margin: '0 0 4px' }}>간편 계정</h2>
        <p className="text-[13px] text-muted-foreground">
          스탭·매니저는 구글 계정 대신 <b>이름 + 숫자 6자리</b>로 로그인합니다. 로그인 화면에서 본인이 가입 신청하면 아래
          승인 대기에 뜨고, 여기서 직접 발급할 수도 있어요. 기본 권한은 가든 섹션의 교육 탭이고 더 넓힐 땐 아래 페이지 접근 권한에서 조정하세요.
        </p>
      </div>

      {issued && (
        <div className="space-y-1 rounded-md bg-muted/40 px-4 py-3 text-[13px]">
          <p>
            <b>{issued.name}</b>의 임시 비밀번호 <span className="tabular text-[22px]">{issued.pin}</span>
          </p>
          <p className="text-muted-foreground">
            지금 본인에게 알려주세요. 이 화면을 떠나면 다시 볼 수 없고, 첫 로그인 때 본인이 새 비밀번호로 바꿉니다.{' '}
            <button className="underline underline-offset-2" onClick={() => setIssued(null)}>확인했어요</button>
          </p>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-4">
          <div>
            <h3 className="text-[15px]">
              승인 대기 <span className="text-[11px] text-muted-foreground tabular">{pending.length}명</span>
            </h3>
            <p className="text-[13px] text-muted-foreground">본인이 로그인 화면에서 신청한 계정입니다. 역할·지점을 지정해 승인하면 바로 로그인할 수 있고, 이메일을 적었으면 승인 안내 메일이 갑니다.</p>
          </div>
          <ul className="space-y-3">
            {pending.map((r) => {
              const d = draftOf(r);
              return (
                <li key={r.user_id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-md bg-muted/40 px-4 py-3 text-[13px]">
                  <span className="font-medium">{r.display_name}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' })} 신청
                  </span>
                  <span className="text-[11px] text-muted-foreground">{r.contact_email ?? '이메일 미기재'}</span>
                  {roleSelect(d.role, (v) => setDraft(r, { role: v }))}
                  {storeToggles(d.stores, (id) => setDraft(r, { stores: d.stores.includes(id) ? d.stores.filter((x) => x !== id) : [...d.stores, id] }))}
                  <button className="ta-btn-primary h-8" disabled={busy || d.stores.length === 0} onClick={() => approve(r)}>
                    승인
                  </button>
                  <button className="text-[11px] text-muted-foreground underline underline-offset-2" disabled={busy} onClick={() => reject(r)}>
                    거절
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="ta-label">이름</span>
          <input className="ta-input" value={name} maxLength={12} placeholder="박연재" onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="ta-label">역할</span>
          {roleSelect(role, setRole, 'ta-input')}
        </label>
        <div>
          <span className="ta-label">지점</span>
          {storeToggles(stores, (id) => setStores((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])), 'md')}
        </div>
        <button className="ta-btn-primary" disabled={busy || !name.trim() || stores.length === 0} onClick={create}>
          {busy ? '처리 중…' : '계정 발급'}
        </button>
      </div>
      {error && <p className="ta-error text-[13px]">{error}</p>}

      {rows === null ? (
        <p className="text-[13px] text-muted-foreground">불러오는 중…</p>
      ) : active.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">아직 발급한 계정이 없어요.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.04em] text-muted-foreground">
                <th className="px-3 py-2">이름</th>
                <th className="px-3 py-2">역할</th>
                <th className="px-3 py-2">지점</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {active.map((r) => {
                const locked = r.locked_until && new Date(r.locked_until).getTime() > Date.now();
                return (
                  <tr key={r.user_id} className="border-t border-border text-[13px]">
                    <td className="px-3 py-2">{r.display_name}</td>
                    <td className="px-3 py-2">{roleSelect(r.role, (v) => setRoleOf(r, v))}</td>
                    <td className="px-3 py-2">{storeToggles(r.stores, (id) => toggleStore(r, id))}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {!r.simple_login ? (
                        '구글 계정'
                      ) : locked ? (
                        <span className="text-amber-600">잠김</span>
                      ) : r.pin_reset_required ? (
                        <span className="text-amber-600">첫 로그인 전</span>
                      ) : (
                        <span className="text-emerald-600">사용 중</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right">
                      {r.simple_login && (
                        <button className="mr-3 text-[11px] underline underline-offset-2" disabled={busy} onClick={() => resetPin(r)}>
                          비밀번호 초기화
                        </button>
                      )}
                      <button className="text-[11px] text-muted-foreground underline underline-offset-2" disabled={busy} onClick={() => remove(r)}>
                        삭제
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 역할 관리 — 접혀 있다가 펼침. 역할마다 '교육 운영 권한' 하나만 정한다 */}
      <div className="space-y-4">
        <button className="text-[13px] underline underline-offset-2" onClick={() => setRolesOpen((o) => !o)}>
          역할 관리 {rolesOpen ? '접기' : `펼치기 (${roles.length}개)`}
        </button>
        {rolesOpen && (
          <div className="space-y-4">
            <p className="text-[13px] text-muted-foreground">
              <b>교육 운영</b>이 켜진 역할은 매니저 화면(출근 일정·지점 집계·교육함 기록)을 보고, 꺼진 역할은 스탭 화면(위시리스트)을 봅니다.
              스탭·매니저는 기본 역할이라 이름만 바꿀 수 있어요.
            </p>
            <ul className="space-y-2">
              {roles.map((r) => (
                <li key={r.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px]">
                  <span className="min-w-[80px]">{r.label}</span>
                  <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                    <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--foreground))]" checked={r.canManage} disabled={busy} onChange={() => toggleRoleManage(r)} />
                    교육 운영
                  </label>
                  <span className="text-[11px] text-muted-foreground tabular">{usedBy(r.key)}명 사용</span>
                  <button className="text-[11px] underline underline-offset-2" disabled={busy} onClick={() => renameRole(r)}>
                    이름 변경
                  </button>
                  {!r.builtin && (
                    <button className="text-[11px] text-muted-foreground underline underline-offset-2" disabled={busy || usedBy(r.key) > 0} onClick={() => deleteRole(r)}>
                      삭제
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap items-center gap-3">
              <input className="ta-input h-8" placeholder="새 역할 이름 (예: 점장)" value={newRole} maxLength={10} onChange={(e) => setNewRole(e.target.value)} />
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-muted-foreground">
                <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--foreground))]" checked={newRoleManage} onChange={(e) => setNewRoleManage(e.target.checked)} />
                교육 운영
              </label>
              <button className="ta-btn h-8" disabled={busy || !newRole.trim()} onClick={addRole}>
                역할 추가
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
