'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { FinanceTask, TaskStatus, TaskBoardId } from '@/lib/finance/tasks';
import { TASK_COLUMNS, CADENCE_LABEL, ymd } from '@/lib/finance/tasks';

// 업무 칸반 — 주간/월간 정기 업무가 자동 생성되고(GET 시 시딩)
// 할 일 → 진행 중 → 완료로 옮기며 관리한다. 단발 업무는 직접 추가.
// board: accounting = 회계 대시보드(기장) / finance = 리포트 재무 대시보드(보고 준비)

const fmtDue = (due: string) => `${Number(due.slice(5, 7))}/${Number(due.slice(8, 10))}`;

export default function TaskBoard({ board }: { board: TaskBoardId }) {
  const router = useRouter();
  const [tasks, setTasks] = useState<FinanceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 단발 업무 추가 폼
  const [newTitle, setNewTitle] = useState('');
  const [newDue, setNewDue] = useState('');

  const load = useCallback(() => {
    fetch('/api/finance/tasks', { cache: 'no-store' })
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        setTasks(Array.isArray(d) ? d : []);
        setError(null);
      })
      // 조회 실패가 '업무 0건'처럼 보이지 않게 구분해서 알린다
      .catch(() => setError('업무 목록을 불러오지 못했어요. 새로고침해 주세요.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    // 입력 화면에 다녀오면 데이터 확인 배지가 갱신되도록 탭 복귀 시 재조회
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const call = async (method: string, body: object): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/finance/tasks', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setError(d?.error ?? '요청에 실패했어요.');
        return false;
      }
      if (Array.isArray(d)) setTasks(d);
      return true;
    } finally {
      setBusy(false);
    }
  };

  // 진행 → 으로 옮기면 해당 입력 화면으로 바로 이동, 완료는 데이터 확인 안 됐으면 한 번 되묻는다
  const move = async (t: FinanceTask, status: TaskStatus) => {
    if (
      status === 'done' &&
      t.check &&
      !t.check.done &&
      !window.confirm(`'${t.title}' — 아직 ${t.check.label} 상태예요. 그래도 완료 처리할까요?`)
    )
      return;
    const ok = await call('PATCH', { id: t.id, status });
    if (ok && status === 'doing' && t.href) router.push(t.href);
  };
  const remove = (t: FinanceTask) => {
    if (!window.confirm(`'${t.title}' 카드를 삭제할까요?${t.templateId ? ' (이번 기간에는 다시 생성되지 않아요)' : ''}`)) return;
    call('DELETE', { id: t.id });
  };
  const add = async () => {
    const title = newTitle.trim();
    if (!title) return;
    if (await call('POST', { title, board, ...(newDue ? { due: newDue } : {}) })) {
      setNewTitle('');
      setNewDue('');
    }
  };

  const today = ymd(new Date());

  // 이 보드의 카드만 — 완료는 최근 것만(지난 완료가 무한히 쌓여 보이지 않게 최신 12개)
  const visible = useMemo(() => {
    const mine = tasks.filter((t) => t.board === board);
    const open = mine.filter((t) => t.status !== 'done');
    const done = mine
      .filter((t) => t.status === 'done')
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
      .slice(0, 12);
    return [...open, ...done];
  }, [tasks, board]);

  const columnTasks = (status: TaskStatus) =>
    visible
      .filter((t) => t.status === status)
      .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));

  return (
    <div className="min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* 단발 업무 추가 */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="단발 업무 추가 — 예: 부가세 예정신고 자료 준비"
          className="ta-input"
          style={{ flex: '1 1 260px', minWidth: 0 }}
        />
        <input
          type="date"
          value={newDue}
          onChange={(e) => setNewDue(e.target.value)}
          className="ta-input"
          style={{ width: 150 }}
          title="기한 (선택)"
        />
        <button onClick={add} disabled={busy || !newTitle.trim()} className="ta-btn-primary" style={{ height: 34 }}>
          추가
        </button>
      </div>
      {error && <p className="text-[13px] text-red-500" style={{ margin: 0 }}>{error}</p>}

      {/* 칸반 3컬럼 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        {TASK_COLUMNS.map((col) => {
          const cards = columnTasks(col.status);
          return (
            <div
              key={col.status}
              className="rounded-md border border-border"
              style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 160 }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span className="text-[13px] font-medium text-foreground">{col.label}</span>
                <span className="tabular text-[11px] text-muted-foreground">{cards.length}</span>
              </div>
              {cards.length === 0 && (
                <span className="text-[11px] text-muted-foreground">{loading ? '불러오는 중…' : '—'}</span>
              )}
              {cards.map((t) => {
                const overdue = t.status !== 'done' && t.due != null && t.due < today;
                return (
                  <div
                    key={t.id}
                    className="rounded-md border border-border bg-card/40"
                    style={{ padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                      {t.href ? (
                        <Link href={t.href} className="text-[13px] font-medium text-foreground hover:underline" style={{ minWidth: 0 }}>
                          {t.title}
                        </Link>
                      ) : (
                        <span className="text-[13px] font-medium text-foreground" style={{ minWidth: 0 }}>{t.title}</span>
                      )}
                      <button
                        onClick={() => remove(t)}
                        disabled={busy}
                        title="카드 삭제"
                        className="text-muted-foreground hover:text-foreground"
                        // 터치 타깃 확보 — 패딩으로 히트 영역을 키우고 네거티브 마진으로 레이아웃은 유지
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, flexShrink: 0, padding: '6px 10px', margin: '-6px -10px' }}
                      >
                        ×
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <span className="rounded-sm border border-border text-[11px] text-muted-foreground" style={{ padding: '0 5px' }}>
                        {CADENCE_LABEL[t.cadence]}
                        {t.periodLabel ? ` · ${t.periodLabel}` : ''}
                      </span>
                      {t.due && (
                        <span className={`tabular text-[11px] ${overdue ? 'font-medium text-red-500' : 'text-muted-foreground'}`}>
                          ~{fmtDue(t.due)}{overdue ? ' 지연' : ''}
                        </span>
                      )}
                      {t.status !== 'done' && t.check && (
                        <span className={`text-[11px] ${t.check.done ? 'text-positive' : 'text-amber-600 dark:text-amber-500'}`}>
                          {t.check.done ? '✓' : '●'} {t.check.label}
                        </span>
                      )}
                      {t.status === 'done' && t.updatedAt && (
                        <span className="tabular text-[11px] text-muted-foreground">
                          {t.updatedAt.slice(5, 10).replace('-', '.')}
                          {t.updatedBy && ` · ${t.updatedBy.split('@')[0]}`}
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {t.status !== 'todo' && (
                        <button
                          onClick={() => move(t, t.status === 'done' ? 'doing' : 'todo')}
                          disabled={busy}
                          className="ta-btn"
                          style={{ height: 26, paddingLeft: 8, paddingRight: 8, fontSize: 12 }}
                        >
                          ← 되돌리기
                        </button>
                      )}
                      {t.status === 'doing' && t.href && (
                        <Link
                          href={t.href}
                          className="ta-btn"
                          style={{ height: 26, paddingLeft: 8, paddingRight: 8, fontSize: 12, display: 'inline-flex', alignItems: 'center' }}
                        >
                          입력하러 가기 →
                        </Link>
                      )}
                      {t.status !== 'done' && (
                        <button
                          onClick={() => move(t, t.status === 'todo' ? 'doing' : 'done')}
                          disabled={busy}
                          className="ta-btn-primary"
                          style={{ height: 26, paddingLeft: 8, paddingRight: 8, fontSize: 12 }}
                          title={t.status === 'todo' && t.href ? '진행으로 옮기고 입력 화면으로 이동' : undefined}
                        >
                          {t.status === 'todo' ? '진행 →' : '완료 ✓'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground" style={{ margin: 0 }}>
        주간·월간 정기 업무는 매주 월요일·매달 1일에 자동으로 &lsquo;할 일&rsquo;에 생성돼요. 월간 카드는 전월분 마감 작업이에요.
      </p>
    </div>
  );
}
