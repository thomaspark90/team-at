'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

// 전처리4 '상품별 상세' 노출·순서 설정 — 표 아래에 접혀 있다가 펼쳐 쓴다.
// 체크 = 노출, ▲▼ = 순서(위 = 표에서 왼쪽). 저장하면 단위(매장)별로 서버에 남아 팀이 같은 표를 본다.
// 순서를 만지지 않은 상품은 총액 큰 순으로 뒤에 붙는다(prepMenu 적용 규칙과 동일).

export default function MenuPrefsPanel({
  unit,
  products, // 전체 상품 라벨(병합 전 원문) — 기본 정렬(총액순) 그대로
  hidden: initialHidden,
  sort: initialSort,
  merges: initialMerges,
}: {
  unit: string;
  products: string[];
  hidden: string[];
  sort: string[];
  merges: Record<string, string[]>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden));
  const [sort, setSort] = useState<string[]>(initialSort.filter((s) => products.includes(s)));
  // 병합 매핑 { 대표: [소스...] } — 소스는 목록에서 사라지고 대표에 배지로 표시된다
  const [merges, setMerges] = useState<Record<string, string[]>>(initialMerges);
  // 병합 모드 — 대표를 고른 뒤 합칠 메뉴들을 클릭해 모은다
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [mergePick, setMergePick] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 화면 목록 = 명시 순서 먼저, 나머지는 기본(총액)순 — 저장 결과와 같은 순서로 보여줘야 헷갈리지 않는다
  const allSources = useMemo(() => new Set(Object.values(merges).flat()), [merges]);
  const ordered = useMemo(() => {
    const pool = products.filter((p) => !allSources.has(p));
    // 병합으로만 존재하는 대표(데이터에 원문이 없는 새 이름)도 목록에 나온다
    for (const t of Object.keys(merges)) if (!pool.includes(t)) pool.push(t);
    const inSort = sort.filter((s) => pool.includes(s));
    const rest = pool.filter((p) => !inSort.includes(p));
    return [...inSort, ...rest];
  }, [products, sort, merges, allSources]);

  // 드래그 정렬 — 행을 끌어 놓는 위치로 이동. 끌기 시작하면 현재 화면 순서 전체가
  // 명시 순서(sort)로 저장돼 예측 가능하게 유지된다. (▲▼ 버튼 → 드래그, 2026-08-20)
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const dragTo = (to: number) => {
    if (dragIdx === null || dragIdx === to) return;
    const next = [...ordered];
    const [moved] = next.splice(dragIdx, 1);
    next.splice(to, 0, moved);
    setSort(next);
    setDragIdx(to); // 드래그 중 실시간 미리보기 — 따라오는 행 기준으로 인덱스 갱신
  };

  // 체크를 켜면 그 상품이 노출 그룹 '맨 아래'로 올라오고, 끄면 숨김 그룹 '맨 위'로 내려간다
  // (2026-08-20 요청) — 노출/숨김이 항상 두 덩어리로 정리돼 목록이 흐트러지지 않는다.
  // 두 경우 모두 삽입 위치는 같다: 마지막 노출 상품 바로 다음.
  const toggle = (label: string) => {
    const wasHidden = hidden.has(label);
    const nextHidden = new Set(hidden);
    if (wasHidden) nextHidden.delete(label);
    else nextHidden.add(label);
    setHidden(nextHidden);

    const rest = ordered.filter((p) => p !== label);
    let lastVisible = -1;
    rest.forEach((p, i) => {
      if (!nextHidden.has(p)) lastVisible = i;
    });
    const next = [...rest];
    next.splice(lastVisible + 1, 0, label);
    setSort(next);
  };

  const startMerge = (target: string) => {
    setMergeTarget(target);
    setMergePick(new Set());
  };
  const commitMerge = () => {
    if (!mergeTarget || mergePick.size === 0) {
      setMergeTarget(null);
      return;
    }
    setMerges((m) => {
      const next = { ...m };
      // 골라진 메뉴가 이미 대표였다면 그 소스들까지 함께 흡수(병합의 병합)
      const absorbed: string[] = [];
      for (const p of Array.from(mergePick)) {
        absorbed.push(p, ...(next[p] ?? []));
        delete next[p];
      }
      next[mergeTarget] = Array.from(new Set([...(next[mergeTarget] ?? []), ...absorbed]));
      return next;
    });
    setMergeTarget(null);
    setMergePick(new Set());
  };
  const unmerge = (target: string) => {
    setMerges((m) => {
      const next = { ...m };
      delete next[target];
      return next;
    });
  };

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/finance/prep/menu-prefs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ unit, hidden: Array.from(hidden), sort, merges }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '저장 실패');
      setMsg('✓ 저장됐어요');
      router.refresh(); // 서버가 새 설정으로 표를 다시 그린다
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setHidden(new Set());
    setSort([]);
    setMerges({});
    setMergeTarget(null);
    setMsg(null);
  }

  return (
    <div className="mt-3 rounded-md border border-border">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>
          표 설정 — 노출 항목·순서 {hidden.size > 0 && `(숨김 ${hidden.size}개)`}
        </span>
        <span>{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <div className="border-t border-border px-4 py-3">
          <p className="m-0 mb-3 text-[12px] text-muted-foreground">
            체크를 켜면 노출 목록 맨 아래로 올라오고, 끄면 숨김 목록 맨 위로 내려가요(합계에는 그대로
            들어가요). ⠿를 잡고 끌어 순서를 바꿔요 — 위가 표의 왼쪽이에요. <b>병합</b>은 POS에서 표기가 갈라진
            같은 메뉴를 한 열로 합쳐 보여줘요 — 원본 데이터는 그대로고 언제든 해제돼요. 이 설정은 이 매장을 보는 모두에게 적용돼요.
          </p>
          {mergeTarget && (
            <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-[12px]">
              <span>
                <b className="text-foreground">‘{mergeTarget}’</b>에 합칠 메뉴를 목록에서 클릭하세요
                {mergePick.size > 0 && ` — ${mergePick.size}개 선택됨`}
              </span>
              <button onClick={commitMerge} disabled={mergePick.size === 0} className="ta-btn-primary text-[12px] disabled:opacity-40">
                합치기
              </button>
              <button onClick={() => setMergeTarget(null)} className="ta-btn text-[12px]">
                취소
              </button>
            </div>
          )}
          <ul className="m-0 flex max-h-[320px] list-none flex-col gap-1 overflow-y-auto p-0">
            {ordered.map((p, i) => (
              <li
                key={p}
                draggable={!mergeTarget}
                onDragStart={(e) => {
                  setDragIdx(i);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  dragTo(i);
                }}
                onDragEnd={() => setDragIdx(null)}
                onClick={() => {
                  if (!mergeTarget || p === mergeTarget) return;
                  setMergePick((s) => {
                    const n = new Set(s);
                    if (n.has(p)) n.delete(p);
                    else n.add(p);
                    return n;
                  });
                }}
                className={`flex select-none items-center gap-2 rounded px-1 py-0.5 text-[13px] ${
                  dragIdx === i ? 'bg-muted opacity-60' : ''
                } ${mergeTarget && p !== mergeTarget ? 'cursor-pointer hover:bg-muted/50' : ''} ${
                  mergePick.has(p) ? 'bg-primary/10' : ''
                } ${mergeTarget === p ? 'bg-muted/60 font-medium' : ''}`}
              >
                <span
                  aria-hidden
                  title="끌어서 순서 바꾸기"
                  className="cursor-grab text-[13px] leading-none text-muted-foreground/50 active:cursor-grabbing"
                >
                  ⠿
                </span>
                <input
                  type="checkbox"
                  checked={!hidden.has(p)}
                  onChange={() => toggle(p)}
                  onClick={(e) => e.stopPropagation()}
                  disabled={!!mergeTarget}
                  aria-label={`${p} 노출`}
                />
                <span className={`min-w-0 flex-1 truncate ${hidden.has(p) ? 'text-muted-foreground/50 line-through' : ''}`}>
                  {p}
                  {merges[p] && merges[p].length > 0 && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground" title={merges[p].join(', ')}>
                      +{merges[p].length}개 병합
                    </span>
                  )}
                  {mergePick.has(p) && <span className="ml-1.5 text-[11px] text-foreground">← 합칠 메뉴</span>}
                </span>
                {!mergeTarget &&
                  (merges[p] && merges[p].length > 0 ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        unmerge(p);
                      }}
                      className="shrink-0 rounded border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                    >
                      병합 해제
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        startMerge(p);
                      }}
                      className="shrink-0 rounded border border-border px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                      title="다른 표기의 같은 메뉴를 이 이름으로 합치기"
                    >
                      병합
                    </button>
                  ))}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-2">
            <button onClick={save} disabled={busy} className="ta-btn-primary text-[13px]">
              {busy ? '저장 중…' : '저장'}
            </button>
            <button onClick={reset} disabled={busy} className="ta-btn text-[13px]">
              기본값(총액순·전체 노출)
            </button>
            {msg && <span className="text-[12px] text-muted-foreground">{msg}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
