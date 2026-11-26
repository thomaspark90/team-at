'use client';

import { useEffect, useMemo, useState } from 'react';
import { STORES, type StoreId } from '@/lib/types';
import { toast } from '@/components/Toast';
import MatrixCheck, { type MatrixCellState } from '@/components/MatrixCheck';

// 가든서비스 › 설정의 「필터커피 내리는 사람」 구역(2026-11-26 대표 지시).
// 필터커피 라인업 화면에서 원두를 누르면 뜨는 이름 버튼과 추출 평가 · 레시피 수정의 이름 선택지를 여기서 고른다.
// 지점별 명단 — 후보는 그 지점에서 근무하는 재직자(직원 명부의 근무 지점)이고, 그중에서 켠 사람만 그 지점 화면에 나온다.
// 스케줄 › 직원 명부의 역할 「커피」는 근무표를 짜는 사람이 보는 표기일 뿐이라 이 명단과 묶지 않는다.
// 화면은 설정 › 계정의 권한 표와 같은 사람 × 칸 표(2026-11-26 대표 지시) — 첫 열 인원, 지점마다 한 열, 그 지점에서 근무하지 않는 칸은 –.
// 칸을 누르면 바로 저장된다(실패하면 되돌리고 알림). 고칠 수 있는 사람은 대표 · 설정 권한 · 서브 매니저 이상 — 권한이 없으면(403) 구역째 숨긴다.
// 설정 화면(구역 하나)과 필터커피 › 내리는 사람(standalone, 화면 하나)에서 같이 쓴다.

interface BrewerStore {
  id: StoreId;
  label: string;
  custom: boolean; // 이 지점 명단을 설정에서 저장한 적이 있는지 — 없으면 스케줄 역할 「커피」인 사람이 켜진 상태로 보인다
  staff: { id: number; name: string; on: boolean }[];
}
interface BrewerView {
  stores: BrewerStore[];
}

type Show = 'all' | StoreId;
const FIRST_W = 168;
const COL_W = 84;
const LINE = '1px solid hsl(var(--border))';
const shortOf = (id: StoreId) => STORES.find((x) => x.id === id)?.short ?? id;

export default function BrewerSettings({ standalone = false }: { standalone?: boolean }) {
  const [view, setView] = useState<BrewerView | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const [show, setShow] = useState<Show>('all');
  const [pending, setPending] = useState<string | null>(null);

  // 사람 한 줄 — 지점별 칸 상태(at 에 키가 없으면 그 지점에서 근무하지 않는 사람)
  const people = useMemo(() => {
    const m = new Map<number, { id: number; name: string; at: Partial<Record<StoreId, boolean>> }>();
    for (const s of view?.stores ?? []) {
      for (const x of s.staff) {
        const p = m.get(x.id) ?? { id: x.id, name: x.name, at: {} };
        p.at[s.id] = x.on;
        m.set(x.id, p);
      }
    }
    return Array.from(m.values()).sort((a, b) => a.name.localeCompare(b.name, 'ko'));
  }, [view]);

  useEffect(() => {
    fetch('/api/garden-brewers', { cache: 'no-store' })
      .then(async (r) => {
        if (r.status === 403) return setDenied(true); // 권한 없음 — 설정 화면에서는 구역을 그리지 않는다
        if (!r.ok) throw new Error();
        setView(await r.json());
      })
      .catch(() => setFailed(true));
  }, []);

  const toggle = async (store: StoreId, id: number) => {
    if (!view || busy) return;
    const prev = view;
    const next: BrewerView = {
      stores: view.stores.map((s) => (s.id === store ? { ...s, custom: true, staff: s.staff.map((x) => (x.id === id ? { ...x, on: !x.on } : x)) } : s)),
    };
    setView(next);
    setBusy(true);
    setPending(`${store}|${id}`);
    try {
      const res = await fetch('/api/garden-brewers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store, staffIds: next.stores.find((s) => s.id === store)!.staff.filter((x) => x.on).map((x) => x.id) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? '저장에 실패했습니다.');
      setView(await res.json());
    } catch (e) {
      setView(prev);
      toast(e instanceof Error ? e.message : '저장에 실패했습니다.', 'error');
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  if (denied && standalone) {
    return (
      <p className="text-body text-muted-foreground" style={{ margin: '24px 0 0' }}>
        필터커피 내리는 사람은 서브 매니저 이상만 고칠 수 있어요.
      </p>
    );
  }
  if (!view && !failed) return null;
  const anyDefault = !!view?.stores.some((s) => !s.custom);
  const cols = (view?.stores ?? []).filter((s) => show === 'all' || s.id === show);
  const rows = people.filter((p) => show === 'all' || p.at[show] !== undefined);
  const stateOf = (p: (typeof people)[number], store: StoreId): MatrixCellState => (p.at[store] === undefined ? 'na' : p.at[store] ? 'on' : 'off');

  return (
    <div className={standalone ? 'pt-[24px]' : 'py-[54px]'}>
      <div className="min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div>
          <p className="text-title font-medium text-foreground" style={{ margin: 0 }}>필터커피 내리는 사람</p>
          <p className="text-body text-muted-foreground" style={{ margin: '2px 0 0' }}>
            필터커피 라인업에서 원두를 누르면 뜨는 이름 버튼과 추출 평가의 이름에 나오는 사람입니다. 지점마다 그 지점에서 근무하는 사람 중에서 고릅니다.
          </p>
        </div>

        {failed && (
          <p className="text-body text-muted-foreground" style={{ margin: 0 }}>
            명단을 불러오지 못했습니다. 새로 고침해 주세요.
          </p>
        )}

        {view && (
          <div>
            <div className="flex flex-wrap items-center gap-3" style={{ marginBottom: 14 }}>
              <div className="inline-flex flex-wrap gap-1 ta-seg">
                {([['all', '전체'], ...view.stores.map((s) => [s.id, s.label])] as [Show, string][]).map(([k, label]) => (
                  <button key={k} type="button" onClick={() => setShow(k)} className={`ta-seg-item px-2.5 py-1 text-body transition-colors ${show === k ? 'ta-seg-on' : ''}`}>
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-caption text-muted-foreground">칸을 누르면 바로 저장돼요 · 지점을 고르면 그 지점 사람만 보여요</span>
            </div>

            {rows.length === 0 ? (
              <p className="text-body text-muted-foreground" style={{ margin: 0 }}>
                이 지점에서 근무하는 재직자가 없습니다. 스케줄 › 직원 명부에서 근무 지점을 지정해 주세요.
              </p>
            ) : (
              <div className="rounded-lg shadow-soft-sm" style={{ display: 'inline-block', maxWidth: '100%', overflowX: 'auto', verticalAlign: 'top' }}>
                <table className="text-caption" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead>
                    <tr>
                      <th
                        className="text-left font-normal text-muted-foreground"
                        style={{ position: 'sticky', left: 0, zIndex: 1, background: 'hsl(var(--background))', minWidth: FIRST_W, padding: '0 14px 10px', verticalAlign: 'bottom', borderBottom: LINE, borderRight: LINE }}
                      >
                        인원 <span className="tabular">· {rows.length}</span>
                      </th>
                      {cols.map((s) => (
                        <th key={s.id} className="font-normal text-foreground" style={{ width: COL_W, minWidth: COL_W, height: 56, padding: '0 0 10px', verticalAlign: 'bottom', borderBottom: LINE }}>
                          {s.label}
                          <span className="tabular block text-muted-foreground" style={{ marginTop: 2 }}>{s.staff.filter((x) => x.on).length}명</span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((p, ri) => {
                      const last = ri === rows.length - 1;
                      return (
                        <tr key={p.id}>
                          <td style={{ position: 'sticky', left: 0, zIndex: 1, background: 'hsl(var(--background))', minWidth: FIRST_W, padding: '8px 14px', borderBottom: last ? undefined : LINE, borderRight: LINE }}>
                            <span className="block text-body text-foreground">{p.name}</span>
                            <span className="block text-caption text-muted-foreground" style={{ marginTop: 2 }}>
                              {view.stores.filter((s) => p.at[s.id] !== undefined).map((s) => shortOf(s.id)).join(' · ')}
                            </span>
                          </td>
                          {cols.map((s) => {
                            const state = stateOf(p, s.id);
                            const clickable = state !== 'na';
                            return (
                              <td key={s.id} style={{ padding: 0, textAlign: 'center', borderBottom: last ? undefined : LINE }}>
                                <button
                                  type="button"
                                  disabled={!clickable || busy}
                                  onClick={() => toggle(s.id, p.id)}
                                  aria-pressed={state === 'on'}
                                  aria-label={`${p.name} · ${s.label}`}
                                  title={clickable ? `${p.name} · ${s.label}` : `${p.name} — ${s.label}에서 근무하지 않아요`}
                                  className={clickable ? 'bg-transparent hover:bg-muted' : 'bg-transparent'}
                                  style={{ width: COL_W, height: 52, border: 'none', cursor: clickable ? 'pointer' : 'default', opacity: pending === `${s.id}|${p.id}` ? 0.4 : 1 }}
                                >
                                  <MatrixCheck state={state} />
                                </button>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {view && (
          <p className="text-body text-muted-foreground" style={{ margin: 0 }}>
            – = 그 지점에서 근무하지 않음.{' '}
            {anyDefault && '아직 한 번도 바꾸지 않은 지점은 직원 명부의 역할이 「커피」인 사람이 켜져 있습니다. 한 번 바꾸면 그 뒤로는 이 명단만 씁니다. '}
            후보는 스케줄 › 직원 명부의 근무 지점을 따릅니다. 두 지점에서 근무하는 사람은 지점마다 따로 켭니다. 새로 들어온 사람은 여기서 켜야 나오고, 퇴사 처리한 사람은 자동으로 빠집니다.
          </p>
        )}
      </div>
    </div>
  );
}
