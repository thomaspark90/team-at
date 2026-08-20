'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

// 전처리4 '상품별 상세' 노출·순서 설정 — 표 아래에 접혀 있다가 펼쳐 쓴다.
// 체크 = 노출, ▲▼ = 순서(위 = 표에서 왼쪽). 저장하면 단위(매장)별로 서버에 남아 팀이 같은 표를 본다.
// 순서를 만지지 않은 상품은 총액 큰 순으로 뒤에 붙는다(prepMenu 적용 규칙과 동일).

export default function MenuPrefsPanel({
  unit,
  products, // 전체 상품 라벨 — 기본 정렬(총액순) 그대로
  hidden: initialHidden,
  sort: initialSort,
}: {
  unit: string;
  products: string[];
  hidden: string[];
  sort: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set(initialHidden));
  const [sort, setSort] = useState<string[]>(initialSort.filter((s) => products.includes(s)));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 화면 목록 = 명시 순서 먼저, 나머지는 기본(총액)순 — 저장 결과와 같은 순서로 보여줘야 헷갈리지 않는다
  const ordered = useMemo(() => {
    const inSort = sort.filter((s) => products.includes(s));
    const rest = products.filter((p) => !inSort.includes(p));
    return [...inSort, ...rest];
  }, [products, sort]);

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

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/finance/prep/menu-prefs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ unit, hidden: Array.from(hidden), sort }),
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
            들어가요). ⠿를 잡고 끌어 순서를 바꿔요 — 위가 표의 왼쪽이에요. 이 설정은 이 매장을 보는 모두에게 적용돼요.
          </p>
          <ul className="m-0 flex max-h-[320px] list-none flex-col gap-1 overflow-y-auto p-0">
            {ordered.map((p, i) => (
              <li
                key={p}
                draggable
                onDragStart={(e) => {
                  setDragIdx(i);
                  e.dataTransfer.effectAllowed = 'move';
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  dragTo(i);
                }}
                onDragEnd={() => setDragIdx(null)}
                className={`flex select-none items-center gap-2 rounded px-1 py-0.5 text-[13px] ${
                  dragIdx === i ? 'bg-muted opacity-60' : ''
                }`}
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
                  aria-label={`${p} 노출`}
                />
                <span className={`min-w-0 flex-1 truncate ${hidden.has(p) ? 'text-muted-foreground/50 line-through' : ''}`}>
                  {p}
                </span>
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
