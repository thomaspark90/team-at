'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { StoreId } from '@/lib/types';
import { TEAM_DOMAIN } from '@/lib/finance/access';
import type { ProfileRole } from '@/lib/account/roles';
import { KIND_KEYS, allowedSet, mergeAccounts, type Account, type AccessKind, type ProfileRow, type UserRow } from './types';

// 계정 · 권한 관리의 데이터와 저장 동작 — 설정 › 계정(Accounts)과 직원 명부(StaffManager)가 같이 쓴다(2026-11-26 직원 명부 통합).
// 두 API 모두 재무 관리자(admin) 전용이라, 관리자가 아니면 isAdmin = false 이고 목록은 비어 있다.

export async function call(url: string, method: 'POST' | 'PATCH' | 'DELETE', payload: Record<string, unknown>) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body?.error || '요청에 실패했습니다.');
  return body;
}
export const accountsApi = (method: 'POST' | 'PATCH' | 'DELETE', payload: Record<string, unknown>) => call('/api/simple-accounts', method, payload);

export function useAccountsAdmin() {
  const [profiles, setProfiles] = useState<ProfileRow[] | null>(null);
  const [roles, setRoles] = useState<ProfileRole[]>([]);
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [allowed, setAllowed] = useState<string[]>([]);
  // null = 확인 중. 관리자가 아니면 계정 목록 API 가 isAdmin: false 로 답한다
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  // 방금 발급·초기화된 비밀번호 — 화면을 떠나면 다시 볼 수 없다
  const [issued, setIssued] = useState<{ name: string; pin: string } | null>(null);

  const loadUsers = useCallback(async () => {
    const j = await fetch('/api/garden-tab-access', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    const admin = !!j?.isAdmin;
    setIsAdmin(admin);
    setUsers(admin && Array.isArray(j.users) ? j.users : []);
    if (Array.isArray(j?.allowedEmails)) setAllowed(j.allowedEmails);
    return admin;
  }, []);
  const loadProfiles = useCallback(async () => {
    const res = await fetch('/api/simple-accounts', { cache: 'no-store' });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body?.error || '목록을 불러오지 못했습니다.');
    setProfiles(body.profiles as ProfileRow[]);
    setRoles((body.roles as ProfileRole[]) ?? []);
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
      setIssued({ name: a.rowName ?? a.title, pin: body.pin });
    }, a.id);

  // 계정 삭제 — 간편 로그인 계정은 간편 계정 API(교육 기록까지 정리), 그 외(이메일·명부만 있는 계정)는
  // 로그인 계정 자체를 지운다(프로필은 cascade). 명부 계정을 프로필만 지우면 로그인 계정이 남는다(이진희 사례, 2026-11-03).
  const removeAccount = (a: Account, after?: () => void) => {
    const external = a.kind === 'email' && !a.title.toLowerCase().endsWith('@' + TEAM_DOMAIN);
    const note =
      a.kind === 'simple'
        ? '\n교육 요청·기록도 함께 지워집니다. 퇴사자라면 지우지 말고 스케줄 › 직원 명부에서 재직을 꺼 주세요.'
        : external
          ? '\n외부 계정이라 허용 목록에서도 빠져 로그인이 차단됩니다.'
          : '\n팀 도메인 계정은 구글 로그인하면 다시 생성되니, 완전 차단은 워크스페이스에서 계정을 정지하세요.';
    if (!window.confirm(`'${a.rowName ?? a.title}' 계정을 삭제할까요? 권한 설정도 함께 지워지며 되돌릴 수 없습니다.${note}`)) return;
    void run(async () => {
      if (a.profile?.simple_login || !a.user) await accountsApi('DELETE', { userId: a.id });
      else await call('/api/garden-tab-access', 'DELETE', { userId: a.id, purge: true });
      after?.();
    }, a.id);
  };

  // 외부(비 팀 도메인) 계정 — 허용 목록에 없으면 로그인 자체가 차단된 상태
  const externalBadge = (a: Account) => {
    const email = a.user?.email.toLowerCase();
    if (!email || email.endsWith('@' + TEAM_DOMAIN)) return null;
    return allowed.includes(email) ? ' · 외부(로그인 허용)' : ' · 외부(로그인 차단)';
  };

  return { profiles, roles, users, setUsers, allowed, setAllowed, isAdmin, busy, busyId, error, setError, issued, setIssued, run, loadAll, accounts, pending, toggleAccess, toggleStore, resetPin, removeAccount, externalBadge };
}

export type AccountsCtl = ReturnType<typeof useAccountsAdmin>;
