'use client';

import { useEffect, useState } from 'react';

// 거래처 계좌장부 — admin/classifier 전용. AI가 자동 학습한 계좌를 확인·수정·삭제.
// 여기 계좌가 영수증에 계좌가 없는 거래처의 자동완성 소스가 된다.
interface Vendor {
  id: number;
  vendor_name: string;
  bank: string | null;
  account_no: string | null;
  account_holder: string | null;
  updated_at: string;
}

interface Draft {
  id?: number;
  vendor_name: string;
  bank: string;
  account_no: string;
  account_holder: string;
}

const EMPTY: Draft = { vendor_name: '', bank: '', account_no: '', account_holder: '' };

export default function VendorBook() {
  const [open, setOpen] = useState(false);
  const [vendors, setVendors] = useState<Vendor[] | null>(null); // null = 미로드
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || vendors !== null) return;
    fetch('/api/finance/vendors')
      .then((r) => r.json())
      .then((j) => {
        if (j.vendors) setVendors(j.vendors as Vendor[]);
        else setError(j.error || '목록을 불러오지 못했어요.');
      })
      .catch(() => setError('목록을 불러오지 못했어요.'));
  }, [open, vendors]);

  async function save() {
    if (!draft) return;
    if (!draft.vendor_name.trim()) return setError('거래처명을 입력하세요.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/finance/vendors', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '저장에 실패했어요.');
      setVendors(j.vendors as Vendor[]);
      setDraft(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(v: Vendor) {
    if (!confirm(`'${v.vendor_name}' 계좌 정보를 삭제할까요? 다음 업로드부터 자동완성되지 않아요.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/finance/vendors', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: v.id }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '삭제에 실패했어요.');
      setVendors(j.vendors as Vendor[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const visible = (vendors ?? []).filter(
    (v) =>
      !query.trim() ||
      v.vendor_name.includes(query.trim()) ||
      (v.account_no ?? '').includes(query.trim())
  );

  const inputCls =
    'w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-foreground/40';

  const editRow = (
    <div className="rounded-xl border border-border bg-background p-3">
      <div className="grid grid-cols-2 gap-2">
        <input className={`${inputCls} col-span-2`} placeholder="거래처명" value={draft?.vendor_name ?? ''} onChange={(e) => setDraft({ ...(draft ?? EMPTY), vendor_name: e.target.value })} />
        <input className={inputCls} placeholder="은행 (예: 농협)" value={draft?.bank ?? ''} onChange={(e) => setDraft({ ...(draft ?? EMPTY), bank: e.target.value })} />
        <input className={inputCls} placeholder="예금주" value={draft?.account_holder ?? ''} onChange={(e) => setDraft({ ...(draft ?? EMPTY), account_holder: e.target.value })} />
        <input className={`${inputCls} col-span-2`} placeholder="계좌번호" value={draft?.account_no ?? ''} onChange={(e) => setDraft({ ...(draft ?? EMPTY), account_no: e.target.value })} />
      </div>
      <div className="mt-2 flex gap-2">
        <button onClick={() => setDraft(null)} className="flex-1 rounded-lg border border-border py-1.5 text-[13px] text-muted-foreground hover:text-foreground">
          취소
        </button>
        <button onClick={save} disabled={busy} className="flex-[2] rounded-lg bg-foreground py-1.5 text-[13px] font-medium text-background disabled:opacity-60">
          {busy ? '저장 중…' : '저장'}
        </button>
      </div>
    </div>
  );

  return (
    <section>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between text-left">
        <div>
          <h2 className="m-0 text-[15px] font-medium">거래처 계좌장부</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            AI가 학습한 거래처 계좌를 확인·수정해요. 잘못된 계좌를 고치면 다음 업로드부터 반영돼요.
          </p>
        </div>
        <span className="text-[13px] text-muted-foreground">{open ? '접기 ▲' : '펼치기 ▼'}</span>
      </button>

      {open && (
        <div className="mt-4 flex flex-col gap-2.5">
          <div className="flex gap-2">
            <input
              className={inputCls}
              placeholder="거래처명·계좌번호 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              onClick={() => setDraft({ ...EMPTY })}
              className="whitespace-nowrap rounded-lg border border-border px-3 py-1.5 text-[13px] text-muted-foreground hover:text-foreground"
            >
              + 추가
            </button>
          </div>

          {draft && draft.id === undefined && editRow}

          {vendors === null && !error && <p className="text-[13px] text-muted-foreground">불러오는 중…</p>}
          {vendors !== null && visible.length === 0 && (
            <p className="text-[13px] text-muted-foreground">
              {query ? '검색 결과가 없어요.' : '아직 학습된 거래처가 없어요. 영수증을 등록하면 자동으로 쌓여요.'}
            </p>
          )}

          {visible.map((v) =>
            draft?.id === v.id ? (
              <div key={v.id}>{editRow}</div>
            ) : (
              <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="m-0 text-[13px] font-medium">{v.vendor_name}</p>
                  <p className="m-0 mt-0.5 text-[13px] text-muted-foreground">
                    {v.account_no ? (
                      <>
                        <span className="font-mono text-foreground">{[v.bank, v.account_no].filter(Boolean).join(' ')}</span>
                        {v.account_holder && ` (${v.account_holder})`}
                      </>
                    ) : (
                      <span className="text-amber-600">계좌 미등록</span>
                    )}
                  </p>
                </div>
                <div className="flex gap-1.5 text-[13px]">
                  <button
                    onClick={() =>
                      setDraft({
                        id: v.id,
                        vendor_name: v.vendor_name,
                        bank: v.bank ?? '',
                        account_no: v.account_no ?? '',
                        account_holder: v.account_holder ?? '',
                      })
                    }
                    className="rounded-lg border border-border px-2.5 py-1 text-muted-foreground hover:text-foreground"
                  >
                    수정
                  </button>
                  <button onClick={() => remove(v)} disabled={busy} className="rounded-lg border border-border px-2.5 py-1 text-muted-foreground hover:text-red-500 disabled:opacity-60">
                    삭제
                  </button>
                </div>
              </div>
            )
          )}

          {error && <p className="text-[13px] text-red-500">{error}</p>}
        </div>
      )}
    </section>
  );
}
