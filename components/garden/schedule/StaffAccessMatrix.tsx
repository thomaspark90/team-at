'use client';

import { useMemo, useState } from 'react';
import PermissionMatrix, { type BrewCtl } from '@/components/settings/accounts/PermissionMatrix';
import AccountInfo from '@/components/settings/accounts/AccountInfo';
import { accountsApi, type AccountsCtl } from '@/components/settings/accounts/useAccountsAdmin';
import type { Account } from '@/components/settings/accounts/types';
import { buildStaffMatrix } from '@/lib/access/permission-matrix';
import type { useBrewerRoster } from '@/components/garden/useBrewerRoster';

// 직원 명부의 「업무 지정」 · 「권한」 묶음(2026-11-26 직원 명부 통합) — 설정 › 계정의 권한 표(PermissionMatrix)를 직원 줄로 그린다.
// 한 줄 = 명부의 한 사람. 로그인 계정이 연결돼 있으면 그 계정의 권한 · 알림 칸이 그대로 나오고, 없으면 그 칸은 –(지정할 수 없음).
// 필터커피 내리는 사람은 계정이 아니라 명부의 사람에 붙는 값이라 계정이 없어도 켤 수 있다.
// 저장 동작은 전부 기존 것(ctl · brew)을 쓴다 — 관리자 전용.

export default function StaffAccessMatrix({
  mode,
  staff,
  ctl,
  brew,
}: {
  mode: 'duty' | 'perm';
  staff: { id: number; name: string; userId: string | null }[];
  ctl: AccountsCtl;
  brew: ReturnType<typeof useBrewerRoster>;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const groups = useMemo(() => buildStaffMatrix(), []);

  const rows: Account[] = useMemo(() => {
    const byId = new Map((ctl.accounts ?? []).map((a) => [a.id, a]));
    return staff.map((s) => {
      const acc = s.userId ? byId.get(s.userId) : undefined;
      return { id: acc?.id ?? `staff-${s.id}`, kind: acc?.kind ?? 'simple', title: acc?.title ?? s.name, user: acc?.user ?? null, profile: acc?.profile ?? null, staffId: s.id, rowName: s.name };
    });
  }, [staff, ctl.accounts]);

  const brewCtl: BrewCtl = {
    state: (a, store) => brew.state(a.staffId, store),
    toggle: async (a, store) => {
      ctl.setError('');
      try {
        await brew.toggle(a.staffId, store);
      } catch (e) {
        ctl.setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
      }
    },
  };

  if (ctl.accounts === null) return <p className="m-0 text-body text-muted-foreground">불러오는 중…</p>;
  if (!rows.length) return <p className="m-0 text-body text-muted-foreground">해당하는 근무자가 없습니다.</p>;

  return (
    <div className="min-w-0">
      {ctl.issued && (
        <div className="space-y-1 rounded-md bg-muted/40 px-4 py-3 text-body" style={{ marginBottom: 14 }}>
          <p>
            <b>{ctl.issued.name}</b>의 임시 비밀번호 <span className="tabular text-display">{ctl.issued.pin}</span>
          </p>
          <p className="ta-prose text-muted-foreground">
            지금 본인에게 알려주세요. 이 화면을 떠나면 다시 볼 수 없고, 첫 로그인 때 본인이 새 비밀번호로 바꿉니다.{' '}
            <button className="underline underline-offset-2" onClick={() => ctl.setIssued(null)}>확인했어요</button>
          </p>
        </div>
      )}
      {ctl.error && <p className="ta-error text-body" style={{ margin: '0 0 12px' }}>{ctl.error}</p>}
      <PermissionMatrix
        accounts={rows}
        groups={groups[mode]}
        showOwner={false}
        showViews={false}
        notes={false}
        brew={brewCtl}
        roles={ctl.roles}
        busyId={ctl.busyId}
        openId={openId}
        onToggleOpen={(id) => setOpenId(openId === id ? null : id)}
        onAccess={(a, kind, key) => void ctl.toggleAccess(a, kind, key)}
        onComments={(a, on) => void ctl.run(() => accountsApi('PATCH', { userId: a.id, canViewComments: on }), a.id)}
        externalBadge={ctl.externalBadge}
        onError={ctl.setError}
        renderInfo={(a) =>
          a.user || a.profile ? (
            <AccountInfo
              a={a}
              busy={ctl.busyId === a.id}
              roles={ctl.roles}
              onRole={(r) => void ctl.run(() => accountsApi('PATCH', { userId: a.id, role: r }), a.id)}
              onStore={(id) => ctl.toggleStore(a, id)}
              onResetPin={() => void ctl.resetPin(a)}
              onDelete={() => ctl.removeAccount(a, () => setOpenId(null))}
            />
          ) : (
            <p className="m-0 text-body text-muted-foreground">
              로그인 계정이 연결되지 않았습니다. 「기본」 묶음의 계정 칸에서 연결하면 권한 · 알림 담당을 줄 수 있습니다.
            </p>
          )
        }
      />
      <p className="text-caption text-muted-foreground" style={{ margin: '14px 0 0' }}>
        – = 지정할 수 없음(로그인 계정이 연결되지 않았거나, 그 지점에서 근무하지 않음) · 흐린 칸 = 상위 섹션이 꺼져 있어 적용되지 않음 · 열 제목에 마우스를 올리면 설명이 보여요.
        {mode === 'duty' && ' 외부 이메일 담당자는 가든 설정 › 알림에서 관리합니다.'}
      </p>
    </div>
  );
}
