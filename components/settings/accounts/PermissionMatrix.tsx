'use client';

import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { OWNER_EMAIL } from '@/lib/finance/access';
import { STORES } from '@/lib/types';
import type { ProfileRole } from '@/lib/account/roles';
import { buildMatrix, OFF_MATRIX_PERMISSIONS, type MatrixColumn, type MatrixGroup, type MatrixGroupId } from '@/lib/access/permission-matrix';
import { allowedSet, type Account, type AccessKind } from './types';
import { useMatrixExtras } from './useMatrixExtras';

// 사람 × 권한 표(2026-11-20 대표 지시) — 첫 행 기능, 첫 열 인원, 둘째 열부터 권한.
// 칸을 누르면 바로 저장된다. 화면 출입은 garden_tab_access(onAccess), 그 외는 useMatrixExtras 가 각 저장소에 쓴다.
// 대표 줄은 출입·기능이 항상 켜짐(잠김)이고 알림 담당만 바꿀 수 있다.

type CellState = 'on' | 'off' | 'locked' | 'na';
type View = 'all' | MatrixGroupId;
const VIEWS: [View, string][] = [
  ['all', '전체'],
  ['sections', '섹션'],
  ['garden', 'Garden Service'],
  ['studio', 'Staff Meal'],
  ['feature', '기능'],
  ['notify', '알림'],
];

const OWNER: Account = { id: 'owner', kind: 'email', title: '대표', user: null, profile: null };
const FIRST_W = 220;
const LINE = '1px solid hsl(var(--border))';

function Check({ state, dim }: { state: CellState; dim: boolean }) {
  if (state === 'na') return <span className="text-muted-foreground" style={{ opacity: 0.4 }}>–</span>;
  const on = state !== 'off';
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        borderRadius: 5,
        fontSize: 12,
        lineHeight: 1,
        border: on ? 'none' : '1.5px solid hsl(var(--muted-foreground) / 0.45)',
        background: on ? 'hsl(var(--foreground))' : 'transparent',
        color: 'hsl(var(--background))',
        opacity: state === 'locked' ? 0.35 : dim ? 0.3 : 1,
      }}
    >
      {on ? '✓' : ''}
    </span>
  );
}

export default function PermissionMatrix({
  accounts,
  roles,
  busyId,
  openId,
  onToggleOpen,
  onAccess,
  onComments,
  externalBadge,
  renderInfo,
  onError,
}: {
  accounts: Account[];
  roles: ProfileRole[];
  busyId: string | null;
  openId: string | null;
  onToggleOpen: (id: string) => void;
  onAccess: (a: Account, kind: AccessKind, key: string) => void;
  onComments: (a: Account, on: boolean) => void;
  externalBadge: (a: Account) => string | null;
  renderInfo: (a: Account) => ReactNode;
  onError: (msg: string) => void;
}) {
  const [view, setView] = useState<View>('all');
  const [pending, setPending] = useState<string | null>(null);
  const extras = useMatrixExtras(onError);
  const all = useMemo(() => buildMatrix(), []);
  const groups = view === 'all' ? all : all.filter((g) => g.id === view);
  const colCount = groups.reduce((n, g) => n + g.subs.reduce((m, s) => m + s.columns.length, 0), 0);
  const rows = [OWNER, ...accounts];

  const emailOf = (a: Account) => (a.id === OWNER.id ? OWNER_EMAIL : a.user?.email ?? null);

  const stateOf = (a: Account, c: MatrixColumn): CellState => {
    const s = c.source;
    const owner = a.id === OWNER.id;
    if (s.type === 'sections' || s.type === 'tabs' || s.type === 'studioTabs') {
      if (owner) return 'locked';
      return a.user ? (allowedSet(a.user, s.type).has(s.key) ? 'on' : 'off') : 'na';
    }
    if (s.type === 'comments') {
      if (owner) return 'locked';
      return a.profile ? (a.profile.can_view_comments ? 'on' : 'off') : 'na';
    }
    // 대표는 항상 운영진·수령 가능 — 판정 코드가 대표를 먼저 통과시킨다
    if (owner && (s.type === 'editor' || (s.type === 'topic' && s.id === 'beanReceive'))) return 'locked';
    const email = emailOf(a);
    if (!email) return 'na';
    return extras.isOn(email, s) ? 'on' : 'off';
  };

  const click = async (a: Account, c: MatrixColumn, state: CellState) => {
    if (state === 'locked' || state === 'na') return;
    const s = c.source;
    if (s.type === 'sections' || s.type === 'tabs' || s.type === 'studioTabs') return onAccess(a, s.type, s.key);
    if (s.type === 'comments') return onComments(a, state === 'off');
    const email = emailOf(a);
    if (!email) return;
    setPending(`${a.id}|${c.id}`);
    await extras.toggle(email, s);
    setPending(null);
  };

  const roleLabel = (key: string) => roles.find((r) => r.key === key)?.label ?? key;
  const subLine = (a: Account) => {
    if (a.id === OWNER.id) return '항상 전체 접근 · 알림만 변경 가능';
    const p = a.profile;
    const parts: string[] = [];
    if (p) parts.push(roleLabel(p.role), p.stores.map((s) => STORES.find((x) => x.id === s)?.short ?? s).join('·') || '지점 없음');
    if (p?.status === 'left') parts.push('퇴사');
    else if (p?.roster_only) parts.push('로그인 없음');
    if (a.kind === 'email' && a.user && !a.user.lastSignInAt) parts.push('로그인 기록 없음');
    if (!a.user) parts.push('로그인 계정 없음');
    return parts.join(' · ') + (externalBadge(a) ?? '');
  };

  const sectionOn = (a: Account, g: MatrixGroup) =>
    !g.needsSection || a.id === OWNER.id || !a.user || allowedSet(a.user, 'sections').has(g.needsSection);

  const sticky = (top: number, z = 2): React.CSSProperties => ({ position: 'sticky', top, zIndex: z, background: 'hsl(var(--background))' });

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 14 }}>
        <div className="inline-flex flex-wrap gap-1 ta-seg">
          {VIEWS.map(([k, label]) => (
            <button key={k} onClick={() => setView(k)} className={`ta-seg-item px-2.5 py-1 text-body transition-colors ${view === k ? 'ta-seg-on' : ''}`}>
              {label}
            </button>
          ))}
        </div>
        <span className="text-caption text-muted-foreground">
          칸을 누르면 바로 저장돼요 · 묶음을 고르면 그 열만 보여요{!extras.loaded && ' · 기능·알림 불러오는 중…'}
        </span>
      </div>

      <div className="rounded-lg shadow-soft-sm" style={{ overflow: 'auto', maxHeight: '76vh' }}>
        <table className="text-caption" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              <th
                rowSpan={3}
                className="text-left font-normal text-muted-foreground"
                style={{ ...sticky(0, 4), left: 0, minWidth: FIRST_W, padding: '0 14px 10px', verticalAlign: 'bottom', borderBottom: LINE, borderRight: LINE }}
              >
                인원 <span className="tabular">· {accounts.length + 1}</span>
              </th>
              {groups.map((g) => (
                <th
                  key={g.id}
                  colSpan={g.subs.reduce((n, s) => n + s.columns.length, 0)}
                  className="whitespace-nowrap text-left font-medium text-foreground"
                  style={{ ...sticky(0), height: 32, padding: '0 10px', borderLeft: LINE }}
                >
                  {g.label}
                </th>
              ))}
            </tr>
            <tr>
              {groups.map((g) =>
                g.subs.map((s, i) => (
                  <th
                    key={`${g.id}-${i}`}
                    colSpan={s.columns.length}
                    className="whitespace-nowrap text-left font-normal text-muted-foreground"
                    style={{ ...sticky(32), height: 24, padding: '0 10px', borderLeft: LINE }}
                  >
                    {s.label}
                  </th>
                )),
              )}
            </tr>
            <tr>
              {groups.map((g) =>
                g.subs.map((s) =>
                  s.columns.map((c, i) => (
                    <th
                      key={c.id}
                      title={c.desc ? `${c.label} — ${c.desc}` : c.label}
                      className="font-normal text-foreground"
                      style={{ ...sticky(56), width: 44, minWidth: 44, height: 132, padding: '0 0 10px', verticalAlign: 'bottom', borderBottom: LINE, borderLeft: i === 0 ? LINE : undefined }}
                    >
                      <span style={{ writingMode: 'vertical-rl', whiteSpace: 'nowrap' }}>{c.label}</span>
                    </th>
                  )),
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => {
              const owner = a.id === OWNER.id;
              const rowBusy = busyId === a.id;
              return (
                <Fragment key={a.id}>
                  <tr>
                    <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'hsl(var(--background))', minWidth: FIRST_W, padding: '8px 14px', borderBottom: LINE, borderRight: LINE }}>
                      <button
                        type="button"
                        disabled={owner}
                        onClick={() => onToggleOpen(a.id)}
                        className="block text-left text-body text-foreground"
                        style={{ background: 'none', border: 'none', padding: 0, cursor: owner ? 'default' : 'pointer', overflowWrap: 'anywhere', maxWidth: FIRST_W + 40 }}
                        title={owner ? undefined : '눌러서 역할·지점·비밀번호·계정 삭제'}
                      >
                        {a.kind === 'email' && !owner ? a.title.split('@')[0] : a.title}
                        {!owner && (
                          <span
                            className={`ml-2 rounded-full px-2 py-0.5 text-caption ${a.kind === 'email' ? 'bg-muted text-muted-foreground' : ''}`}
                            style={a.kind === 'simple' ? { background: 'hsl(200 75% 90%)', color: 'hsl(205 65% 30%)' } : undefined}
                          >
                            {a.kind === 'simple' ? '간편' : '이메일'}
                          </span>
                        )}
                        {!owner && <span className="ml-1 text-caption text-muted-foreground">{openId === a.id ? '▲' : '▼'}</span>}
                      </button>
                      <span className="block text-caption text-muted-foreground" style={{ marginTop: 2 }}>
                        {subLine(a)}
                        {rowBusy && ' · 저장 중…'}
                      </span>
                    </td>
                    {groups.map((g) => {
                      const dim = !sectionOn(a, g);
                      return g.subs.map((s) =>
                        s.columns.map((c, i) => {
                          const state = stateOf(a, c);
                          const busy = rowBusy || pending === `${a.id}|${c.id}`;
                          const clickable = state === 'on' || state === 'off';
                          return (
                            <td key={c.id} style={{ padding: 0, textAlign: 'center', borderBottom: LINE, borderLeft: i === 0 ? LINE : undefined }}>
                              <button
                                type="button"
                                disabled={!clickable || busy || dim}
                                onClick={() => void click(a, c, state)}
                                aria-pressed={state === 'on' || state === 'locked'}
                                aria-label={`${a.title} · ${c.label}`}
                                title={
                                  dim
                                    ? `${c.label} — 상위 섹션이 꺼져 있어 적용되지 않아요`
                                    : state === 'locked'
                                      ? `${c.label} — 대표는 항상 켜짐`
                                      : state === 'na'
                                        ? `${c.label} — 이 계정에는 지정할 수 없어요`
                                        : c.label
                                }
                                className={clickable && !dim ? 'hover:bg-muted' : ''}
                                style={{ width: 44, height: 46, background: 'none', border: 'none', cursor: clickable && !dim ? 'pointer' : 'default', opacity: busy ? 0.4 : 1 }}
                              >
                                <Check state={state} dim={dim} />
                              </button>
                            </td>
                          );
                        }),
                      );
                    })}
                  </tr>
                  {openId === a.id && !owner && (
                    <tr>
                      <td colSpan={colCount + 1} className="bg-muted/40" style={{ padding: 0, borderBottom: LINE }}>
                        {/* 표가 가로로 길어도 정보 칸은 화면 왼쪽에 붙어 있게 */}
                        <div style={{ position: 'sticky', left: 0, width: 'min(680px, 86vw)', padding: '18px 14px 20px' }}>{renderInfo(a)}</div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-caption text-muted-foreground" style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>흐린 칸 = 상위 섹션이 꺼져 있어 적용되지 않음 · – = 그 계정에는 지정할 수 없음(로그인 계정 없음 등) · 열 제목에 마우스를 올리면 설명이 보여요.</span>
        <span>원두 수령 담당을 아무도 지정하지 않으면 &lsquo;필터 원두 발주&rsquo; 화면 출입이 있는 사람 누구나 수령을 기재합니다.</span>
        <span>알림 담당이 비어 있는 항목은 원두 재고 수신자 전체에게 갑니다(레시피 등록·수정은 지정한 사람에게만). 표에 없는 외부 이메일 담당자는 가든 설정 › 알림에서 관리합니다.</span>
      </div>

      <details style={{ marginTop: 18 }}>
        <summary className="cursor-pointer text-body text-muted-foreground">표에서 바꿀 수 없는 권한 {OFF_MATRIX_PERMISSIONS.length}가지</summary>
        <ul className="ta-prose text-body text-muted-foreground" style={{ margin: '10px 0 0', paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {OFF_MATRIX_PERMISSIONS.map((p) => (
            <li key={p.label}>
              <span className="text-foreground">{p.label}</span> — {p.rule}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
