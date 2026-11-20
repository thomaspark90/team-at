'use client';

import { STORES, type StoreId } from '@/lib/types';
import type { ProfileRole } from '@/lib/account/roles';
import type { Account } from './types';

// 계정 기본 정보 — 권한 표에서 이름을 누르면 그 줄 아래에 펼쳐진다.
// 간편 계정(프로필)은 역할·지점, 공통으로 로그인 주소·비밀번호 초기화·계정 삭제. 권한 켜고 끄기는 표의 칸에서 한다.

export default function AccountInfo({
  a,
  busy,
  roles,
  onRole,
  onStore,
  onResetPin,
  onDelete,
}: {
  a: Account;
  busy: boolean;
  roles: ProfileRole[];
  onRole: (role: string) => void;
  onStore: (id: StoreId) => void;
  onResetPin: () => void;
  onDelete: () => void;
}) {
  const p = a.profile;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr', rowGap: 14, alignItems: 'center' }} className="text-body">
      {p && (
        <>
          <span className="text-caption text-muted-foreground">역할</span>
          <div className="inline-flex flex-wrap gap-1 ta-seg" style={{ justifySelf: 'start' }}>
            {roles.map((r) => (
              <button
                key={r.key}
                disabled={busy}
                onClick={() => r.key !== p.role && onRole(r.key)}
                className={`ta-seg-item px-2.5 py-1 text-body transition-colors ${p.role === r.key ? 'ta-seg-on' : ''}`}
              >
                {r.label}
                {r.canManage ? ' · 운영' : ''}
              </button>
            ))}
          </div>
          <span className="text-caption text-muted-foreground">지점</span>
          <div className="inline-flex gap-1 ta-seg" style={{ justifySelf: 'start' }}>
            {STORES.map((s) => (
              <button
                key={s.id}
                disabled={busy}
                onClick={() => onStore(s.id)}
                className={`ta-seg-item px-2.5 py-1 text-body transition-colors ${p.stores.includes(s.id) ? 'ta-seg-on' : ''}`}
              >
                {s.short}
              </button>
            ))}
          </div>
        </>
      )}
      <span className="text-caption text-muted-foreground">로그인</span>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
        {a.kind === 'email' && <span style={{ overflowWrap: 'anywhere' }}>이메일 ({a.title})</span>}
        {!a.user && <span className="text-muted-foreground">로그인 계정 없음 — 권한을 걸 수 없어요</span>}
        {p && (p.simple_login || p.roster_only) && (
          <button className="text-caption underline underline-offset-2" disabled={busy} onClick={onResetPin}>
            {p.roster_only ? '로그인 열기 (비밀번호 발급)' : '비밀번호 초기화'}
          </button>
        )}
        <button className="text-caption underline underline-offset-2" style={{ color: 'hsl(0 72% 45%)' }} disabled={busy} onClick={onDelete}>
          계정 삭제
        </button>
      </div>
    </div>
  );
}
