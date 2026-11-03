'use client';

import { useState } from 'react';
import type { ProfileRole } from '@/lib/account/roles';

// 역할 관리 — 접혀 있다가 펼침. 역할마다 '교육 운영 권한' 하나만 정한다 (finance.profile_roles)
export default function RoleManager({
  roles,
  usedBy,
  busy,
  run,
}: {
  roles: ProfileRole[];
  usedBy: (key: string) => number;
  busy: boolean;
  run: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [newRole, setNewRole] = useState('');
  const [newRoleManage, setNewRoleManage] = useState(false);

  const roleApi = async (method: 'POST' | 'PATCH' | 'DELETE', payload: Record<string, unknown>) => {
    const res = await fetch('/api/simple-accounts/roles', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.error || '요청에 실패했습니다.');
    return body;
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
    void run(() => roleApi('PATCH', { key: r.key, label: label.trim() }));
  };
  const deleteRole = (r: ProfileRole) => {
    if (!window.confirm(`'${r.label}' 역할을 삭제할까요?`)) return;
    void run(() => roleApi('DELETE', { key: r.key }));
  };

  return (
    <div className="space-y-4">
      <button className="text-body underline underline-offset-2" onClick={() => setOpen((o) => !o)}>
        역할 관리 {open ? '접기' : `펼치기 (${roles.length}개)`}
      </button>
      {open && (
        <div className="space-y-4">
          <p className="ta-prose text-body text-muted-foreground">
            <b>교육 운영</b>이 켜진 역할은 매니저 화면(출근 일정·지점 집계·교육함 기록)을 보고, 꺼진 역할은 스탭 화면(위시리스트)을 봅니다.
            스탭·매니저는 기본 역할이라 이름만 바꿀 수 있어요.
          </p>
          <ul className="space-y-2">
            {roles.map((r) => (
              <li key={r.key} className="flex flex-wrap items-center gap-x-4 gap-y-1 text-body">
                <span className="min-w-[80px]">{r.label}</span>
                <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[hsl(var(--foreground))]"
                    checked={r.canManage}
                    disabled={busy}
                    onChange={() => void run(() => roleApi('PATCH', { key: r.key, canManage: !r.canManage }))}
                  />
                  교육 운영
                </label>
                <span className="text-caption text-muted-foreground tabular">{usedBy(r.key)}명 사용</span>
                <button className="text-caption underline underline-offset-2" disabled={busy} onClick={() => renameRole(r)}>
                  이름 변경
                </button>
                {!r.builtin && (
                  <button className="text-caption text-muted-foreground underline underline-offset-2" disabled={busy || usedBy(r.key) > 0} onClick={() => deleteRole(r)}>
                    삭제
                  </button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center gap-3">
            <input className="ta-input h-8" placeholder="새 역할 이름 (예: 점장)" value={newRole} maxLength={10} onChange={(e) => setNewRole(e.target.value)} />
            <label className="flex cursor-pointer items-center gap-2 text-body text-muted-foreground">
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
  );
}
