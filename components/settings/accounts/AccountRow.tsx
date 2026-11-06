'use client';

import { GARDEN_TABS, GARDEN_TAB_KEYS } from '@/lib/garden/tabs';
import { STUDIO_TABS, STUDIO_TAB_KEYS } from '@/lib/studio/tabs';
import { SECTIONS, SECTION_KEYS } from '@/lib/access/sections';
import { STORES, type StoreId } from '@/lib/types';
import type { ProfileRole } from '@/lib/account/roles';
import type { Account, AccessKind, UserRow } from './types';

// 계정 한 줄 — 접힌 상태는 이름·종류·요약, 펼치면 기본 정보(간편: 역할·지점·코멘트·비밀번호)와
// 볼 수 있는 화면(섹션·가든 탭·스탭밀 탭 칩)을 한곳에서 바꾼다.

export const KIND_KEYS: Record<AccessKind, string[]> = { tabs: GARDEN_TAB_KEYS, studioTabs: STUDIO_TAB_KEYS, sections: SECTION_KEYS };
export const allowedSet = (u: UserRow, kind: AccessKind) => new Set(u[kind] ?? KIND_KEYS[kind]);

const accessSummary = (u: UserRow) => {
  if (u.sections === null && u.tabs === null && u.studioTabs === null) return '전체 접근';
  const n = (kind: AccessKind) => (u[kind] === null ? KIND_KEYS[kind].length : u[kind]!.length);
  return `섹션 ${n('sections')}/${SECTION_KEYS.length} · 가든 탭 ${n('tabs')}/${GARDEN_TAB_KEYS.length} · 스탭밀 탭 ${n('studioTabs')}/${STUDIO_TAB_KEYS.length}`;
};

function Chip({ on, disabled, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-3 py-1.5 text-caption transition-colors ${
        on ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground shadow-soft-sm hover:text-foreground'
      }`}
      style={{ cursor: disabled ? 'not-allowed' : 'pointer' }}
    >
      {children}
    </button>
  );
}

function Tag({ tone, children }: { tone: 'simple' | 'email' | 'warn'; children: React.ReactNode }) {
  const style =
    tone === 'simple'
      ? { background: 'hsl(200 75% 90%)', color: 'hsl(205 65% 30%)' }
      : tone === 'warn'
        ? { background: 'hsl(0 72% 45% / 0.1)', color: 'hsl(0 72% 45%)' }
        : undefined;
  return (
    <span className={`ml-2 rounded-full px-2 py-0.5 text-caption font-normal ${tone === 'email' ? 'bg-muted text-muted-foreground' : ''}`} style={style}>
      {children}
    </span>
  );
}

export default function AccountRow({
  a,
  open,
  busy,
  roles,
  external,
  onToggleOpen,
  onAccess,
  onRole,
  onStore,
  onComments,
  onResetPin,
  onDelete,
}: {
  a: Account;
  open: boolean;
  busy: boolean;
  roles: ProfileRole[];
  external: string | null; // 외부(비 팀 도메인) 계정 표시 — '외부(로그인 허용)' 등
  onToggleOpen: () => void;
  onAccess: (kind: AccessKind, key: string) => void;
  onRole: (role: string) => void;
  onStore: (id: StoreId) => void;
  onComments: (on: boolean) => void;
  onResetPin: () => void;
  onDelete: () => void;
}) {
  const p = a.profile;
  const u = a.user;
  const roleLabel = (key: string) => roles.find((r) => r.key === key)?.label ?? key;
  const locked = !!p?.locked_until && new Date(p.locked_until).getTime() > Date.now();
  const status = !p
    ? null
    : p.status === 'left'
      ? { text: '퇴사 · 로그인 차단', cls: 'text-muted-foreground' }
    : p.roster_only
      ? { text: '명부 등록 · 로그인 없음', cls: 'text-muted-foreground' }
      : !p.simple_login
        ? null
        : locked
          ? { text: '잠김', cls: 'text-amber-600' }
          : p.pin_reset_required
            ? { text: '첫 로그인 전', cls: 'text-amber-600' }
            : { text: '사용 중', cls: 'text-emerald-600' };
  const neverSignedIn = a.kind === 'email' && !!u && !u.lastSignInAt;

  const sec = u ? allowedSet(u, 'sections') : null;
  const gardenOn = !!sec?.has('garden');
  const studioOn = !!sec?.has('studio');

  return (
    <div className="rounded-lg bg-background shadow-soft-sm">
      <button
        onClick={onToggleOpen}
        className="flex w-full items-center justify-between gap-3 text-left"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '14px 18px' }}
      >
        <span style={{ minWidth: 0 }}>
          <span className="block text-body text-foreground" style={{ overflowWrap: 'anywhere' }}>
            {a.title}
            <Tag tone={a.kind}>{a.kind === 'simple' ? '간편' : '이메일'}</Tag>
            {neverSignedIn && <Tag tone="warn">로그인 기록 없음</Tag>}
          </span>
          <span className="block text-caption text-muted-foreground" style={{ marginTop: 3 }}>
            {p && `${roleLabel(p.role)} · ${p.stores.map((s) => STORES.find((x) => x.id === s)?.short ?? s).join('·') || '지점 없음'} · `}
            {status && (
              <>
                <span className={status.cls}>{status.text}</span>
                {' · '}
              </>
            )}
            {u ? accessSummary(u) : '로그인 계정 없음'}
            {external}
            {busy && ' · 저장 중…'}
          </span>
        </span>
        <span className="text-body text-muted-foreground" style={{ flexShrink: 0 }}>
          {open ? '접기 ▲' : '권한 설정 ▼'}
        </span>
      </button>

      {open && (
        <div className="border-t border-border" style={{ padding: '20px 18px 24px', display: 'flex', flexDirection: 'column', gap: 28 }}>
          {/* 기본 정보 — 간편 계정(프로필)이면 역할·지점·코멘트·비밀번호, 이메일 계정은 로그인 주소만 */}
          <div>
            <p className="ta-label">기본 정보</p>
            <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', rowGap: 14, alignItems: 'center' }} className="text-body">
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
                  <span className="text-caption text-muted-foreground">코멘트 열람</span>
                  {/* 교육 코멘트 열람 — 대표가 지정. 티칭 스태프는 자기 일정 코멘트는 항상 본다 */}
                  <label className="flex cursor-pointer items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[hsl(var(--foreground))]"
                      checked={!!p.can_view_comments}
                      disabled={busy}
                      onChange={(e) => onComments(e.target.checked)}
                    />
                    모든 교육 코멘트 보기
                  </label>
                </>
              )}
              <span className="text-caption text-muted-foreground">로그인</span>
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                {a.kind === 'email' && <span style={{ overflowWrap: 'anywhere' }}>이메일 ({a.title})</span>}
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
          </div>

          {/* 볼 수 있는 화면 — 전부 켜짐 = 제한 없음, 일부 끄면 허용 목록으로 저장되고 미들웨어가 서버에서 강제 */}
          {u && sec && (
            <>
              <div>
                <p className="ta-label">볼 수 있는 화면 · 섹션</p>
                <div className="flex flex-wrap gap-1.5">
                  {SECTIONS.map((s) => (
                    <Chip key={s.key} on={sec.has(s.key)} disabled={busy} onClick={() => onAccess('sections', s.key)}>
                      {s.label}
                    </Chip>
                  ))}
                </div>
              </div>
              <div style={{ opacity: gardenOn ? 1 : 0.45 }}>
                <p className="ta-label">Garden Service 탭</p>
                <div className="flex flex-wrap gap-1.5">
                  {GARDEN_TABS.map((t) => (
                    <Chip key={t.key} on={allowedSet(u, 'tabs').has(t.key)} disabled={busy || !gardenOn} onClick={() => onAccess('tabs', t.key)}>
                      {t.label}
                    </Chip>
                  ))}
                </div>
                {!gardenOn && <p className="text-caption text-muted-foreground" style={{ margin: '6px 0 0' }}>Garden Service 섹션이 꺼져 있어 적용되지 않아요</p>}
              </div>
              <div style={{ opacity: studioOn ? 1 : 0.45 }}>
                <p className="ta-label">Staff Meal 탭</p>
                <div className="flex flex-wrap gap-1.5">
                  {STUDIO_TABS.map((t) => (
                    <Chip key={t.key} on={allowedSet(u, 'studioTabs').has(t.key)} disabled={busy || !studioOn} onClick={() => onAccess('studioTabs', t.key)}>
                      {t.label}
                    </Chip>
                  ))}
                </div>
                {!studioOn && <p className="text-caption text-muted-foreground" style={{ margin: '6px 0 0' }}>Staff Meal 섹션이 꺼져 있어 적용되지 않아요</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
