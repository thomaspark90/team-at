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

  const move = (label: string, dir: -1 | 1) => {
    const i = ordered.indexOf(label);
    const j = i + dir;
    if (j < 0 || j >= ordered.length) return;
    const next = [...ordered];
    [next[i], next[j]] = [next[j], next[i]];
    setSort(next); // 현재 화면 순서 전체를 명시 순서로 저장 — 단순하고 예측 가능
  };

  const toggle = (label: string) =>
    setHidden((s) => {
      const n = new Set(s);
      if (n.has(label)) n.delete(label);
      else n.add(label);
      return n;
    });

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
            체크를 끄면 표에서 숨겨져요(합계에는 그대로 들어가요). ▲▼로 열 순서를 바꿔요 — 위가 표의
            왼쪽이에요. 이 설정은 이 매장을 보는 모두에게 적용돼요.
          </p>
          <ul className="m-0 flex max-h-[320px] list-none flex-col gap-1 overflow-y-auto p-0">
            {ordered.map((p, i) => (
              <li key={p} className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={!hidden.has(p)}
                  onChange={() => toggle(p)}
                  aria-label={`${p} 노출`}
                />
                <span className={`min-w-0 flex-1 truncate ${hidden.has(p) ? 'text-muted-foreground/50 line-through' : ''}`}>
                  {p}
                </span>
                <button
                  onClick={() => move(p, -1)}
                  disabled={i === 0}
                  className="rounded border border-border px-1.5 text-[11px] text-muted-foreground disabled:opacity-30"
                  aria-label={`${p} 위로`}
                >
                  ▲
                </button>
                <button
                  onClick={() => move(p, 1)}
                  disabled={i === ordered.length - 1}
                  className="rounded border border-border px-1.5 text-[11px] text-muted-foreground disabled:opacity-30"
                  aria-label={`${p} 아래로`}
                >
                  ▼
                </button>
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
