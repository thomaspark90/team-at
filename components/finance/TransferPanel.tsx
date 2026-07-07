'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { TransferExtraction, TransferRequestRow } from '@/lib/finance/transfer';

interface Props {
  role: string | null; // finance 역할 — 완료 처리는 admin/classifier 만
  email: string;
}

interface Draft {
  vendor_name: string;
  doc_date: string;
  amount: string;
  items_summary: string;
  bank: string;
  account_no: string;
  account_holder: string;
  memo: string;
}

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// 폰 사진(수 MB)을 서버 한도·AI 비용에 맞게 축소 (긴 변 1600px JPEG)
async function resizeImage(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) return file;
    return new File([blob], 'receipt.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export default function TransferPanel({ role, email }: Props) {
  const isStaff = ['admin', 'classifier'].includes(role ?? '');
  const fileInput = useRef<HTMLInputElement>(null);
  const resizedRef = useRef<File | null>(null);

  const [parsing, setParsing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [balanceTotal, setBalanceTotal] = useState<number | null>(null);
  const [accountFromBook, setAccountFromBook] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [tab, setTab] = useState<'pending' | 'done'>('pending');
  const [rows, setRows] = useState<TransferRequestRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [imageViewId, setImageViewId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await fetch('/api/finance/transfer');
      const j = await res.json();
      if (res.ok) setRows(j.requests as TransferRequestRow[]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // ---------- 업로드 → AI 인식 ----------
  async function onPickFile(f: File | null) {
    if (!f) return;
    setError(null);
    setNotice(null);
    setDraft(null);
    setParsing(true);
    try {
      const resized = await resizeImage(f);
      resizedRef.current = resized;
      setPreviewUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return URL.createObjectURL(resized);
      });
      const fd = new FormData();
      fd.append('file', resized);
      const res = await fetch('/api/finance/transfer/parse', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '인식에 실패했어요.');
      const ex = j.extraction as TransferExtraction;
      setBalanceTotal(ex.balance_total);
      setAccountFromBook(!!j.savedAccount && !!ex.account_no);
      setDraft({
        vendor_name: ex.vendor_name ?? '',
        doc_date: ex.doc_date ?? '',
        amount: ex.amount != null ? String(ex.amount) : '',
        items_summary: ex.items_summary ?? '',
        bank: ex.bank ?? '',
        account_no: ex.account_no ?? '',
        account_holder: ex.account_holder ?? '',
        memo: '',
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setParsing(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function closeDraft() {
    setDraft(null);
    setBalanceTotal(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    resizedRef.current = null;
  }

  // ---------- 확인 → 등록 ----------
  async function submit() {
    if (!draft) return;
    const amount = Number(draft.amount.replace(/[,\s]/g, ''));
    if (!draft.vendor_name.trim()) return setError('거래처명을 입력하세요.');
    if (!Number.isFinite(amount) || amount <= 0) return setError('금액을 확인하세요.');
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      if (resizedRef.current) fd.append('file', resizedRef.current);
      fd.append('fields', JSON.stringify({ ...draft, amount }));
      const res = await fetch('/api/finance/transfer', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '등록에 실패했어요.');
      setNotice(`${draft.vendor_name} ${won(amount)} — 송금 대기에 올렸어요.`);
      closeDraft();
      setTab('pending');
      loadList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- 대시보드 액션 ----------
  async function mark(id: number, action: 'done' | 'undo') {
    setBusyId(id);
    try {
      const res = await fetch(`/api/finance/transfer/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '처리에 실패했어요.');
      loadList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: number) {
    if (!confirm('이 송금 요청을 삭제할까요?')) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/finance/transfer/${id}`, { method: 'DELETE' });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '삭제에 실패했어요.');
      loadList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied((c) => (c === key ? null : c)), 1500);
    } catch {
      /* http 환경 등에서 실패 시 무시 */
    }
  }

  const visible = rows.filter((r) => r.status === tab);
  const pendingSum = rows.filter((r) => r.status === 'pending').reduce((s, r) => s + Number(r.amount), 0);
  const pendingCount = rows.filter((r) => r.status === 'pending').length;

  const inputCls =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-[14px] text-foreground outline-none focus:border-foreground/40';
  const labelCls = 'text-[12px] text-muted-foreground';

  return (
    <div className="flex flex-col gap-6">
      {/* ---------- 업로드 ---------- */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="m-0 text-[15px] font-medium">송금 요청 올리기</h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          거래명세서·영수증 사진을 올리면 거래처, 금액, 입금 계좌를 자동으로 읽어요. 내용을 확인하고 등록하면
          송금 담당자 리스트에 올라가요.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
        />
        <button
          onClick={() => fileInput.current?.click()}
          disabled={parsing}
          className="mt-4 w-full rounded-xl border border-dashed border-border bg-background py-6 text-[14px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-60 sm:w-auto sm:px-10"
        >
          {parsing ? 'AI가 읽는 중…' : '📷 사진 촬영 / 이미지 선택'}
        </button>
        {notice && <p className="mt-3 text-[13px]" style={{ color: 'hsl(var(--number-colored))' }}>{notice}</p>}
        {error && !draft && <p className="mt-3 text-[13px] text-red-500">{error}</p>}
      </section>

      {/* ---------- 확인창 ---------- */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" onClick={closeDraft}>
          <div
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:max-w-[520px] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="m-0 text-[15px] font-medium">인식 결과 확인</h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              잘못 읽은 부분은 고친 뒤 등록하세요.
              {accountFromBook && ' 계좌는 이전에 확인된 거래처 계좌로 채웠어요.'}
            </p>

            {previewUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="영수증 미리보기" className="mt-3 max-h-[180px] w-full rounded-lg border border-border object-contain" />
            )}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1">
                <span className={labelCls}>거래처 (돈 받을 곳)</span>
                <input className={inputCls} value={draft.vendor_name} onChange={(e) => setDraft({ ...draft, vendor_name: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <span className={labelCls}>거래일자</span>
                <input className={inputCls} type="date" value={draft.doc_date} onChange={(e) => setDraft({ ...draft, doc_date: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <span className={labelCls}>금액 (원)</span>
                <input className={inputCls} inputMode="numeric" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
              </div>
              {balanceTotal != null && String(balanceTotal) !== draft.amount && (
                <div className="col-span-2 -mt-1 flex items-center gap-2 text-[12px] text-muted-foreground">
                  <span>명세서에 미수금 포함 총잔액 {won(balanceTotal)}이 있어요.</span>
                  <button
                    className="rounded border border-border px-2 py-0.5 hover:text-foreground"
                    onClick={() => setDraft({ ...draft, amount: String(balanceTotal) })}
                  >
                    총잔액으로 변경
                  </button>
                </div>
              )}
              <div className="flex flex-col gap-1">
                <span className={labelCls}>은행</span>
                <input className={inputCls} value={draft.bank} onChange={(e) => setDraft({ ...draft, bank: e.target.value })} placeholder="예: 농협" />
              </div>
              <div className="flex flex-col gap-1">
                <span className={labelCls}>예금주</span>
                <input className={inputCls} value={draft.account_holder} onChange={(e) => setDraft({ ...draft, account_holder: e.target.value })} />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <span className={labelCls}>계좌번호</span>
                <input
                  className={inputCls}
                  value={draft.account_no}
                  onChange={(e) => setDraft({ ...draft, account_no: e.target.value })}
                  placeholder="명세서에 없으면 비워두세요 — 담당자가 확인해요"
                />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <span className={labelCls}>품목 요약</span>
                <input className={inputCls} value={draft.items_summary} onChange={(e) => setDraft({ ...draft, items_summary: e.target.value })} />
              </div>
              <div className="col-span-2 flex flex-col gap-1">
                <span className={labelCls}>메모 (선택)</span>
                <input className={inputCls} value={draft.memo} onChange={(e) => setDraft({ ...draft, memo: e.target.value })} placeholder="담당자에게 남길 말" />
              </div>
            </div>

            {error && <p className="mt-3 text-[13px] text-red-500">{error}</p>}

            <div className="mt-5 flex gap-2">
              <button onClick={closeDraft} className="flex-1 rounded-xl border border-border py-2.5 text-[14px] text-muted-foreground hover:text-foreground">
                취소
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-[2] rounded-xl bg-foreground py-2.5 text-[14px] font-medium text-background disabled:opacity-60"
              >
                {submitting ? '등록 중…' : '확인 — 송금 대기에 등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- 송금 대시보드 ---------- */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-[15px] font-medium">송금 대시보드</h2>
          <div className="flex gap-1 rounded-lg border border-border p-0.5 text-[13px]">
            {(['pending', 'done'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1 ${tab === t ? 'bg-foreground text-background' : 'text-muted-foreground'}`}
              >
                {t === 'pending' ? `대기 ${pendingCount}` : '완료'}
              </button>
            ))}
          </div>
        </div>
        {tab === 'pending' && pendingCount > 0 && (
          <p className="mt-2 text-[13px] text-muted-foreground">
            대기 합계 <span className="font-medium text-foreground">{won(pendingSum)}</span> · {pendingCount}건
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {loadingList && <p className="text-[13px] text-muted-foreground">불러오는 중…</p>}
          {!loadingList && visible.length === 0 && (
            <p className="text-[13px] text-muted-foreground">{tab === 'pending' ? '대기 중인 송금이 없어요.' : '완료된 송금이 없어요.'}</p>
          )}
          {visible.map((r) => {
            const account = [r.bank, r.account_no].filter(Boolean).join(' ');
            const mine = r.requester_email === email;
            return (
              <div key={r.id} className="rounded-xl border border-border bg-background p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[15px] font-medium">{r.vendor_name}</span>
                  <span className="flex items-baseline gap-1.5 text-[16px] font-semibold" style={{ color: 'hsl(var(--number-colored))' }}>
                    {won(Number(r.amount))}
                    <button
                      onClick={() => copy(String(Math.round(Number(r.amount))), `amt${r.id}`)}
                      className="text-[11px] font-normal text-muted-foreground hover:text-foreground"
                    >
                      {copied === `amt${r.id}` ? '복사됨' : '복사'}
                    </button>
                  </span>
                </div>

                <div className="mt-1.5 text-[13px]">
                  {account ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono">{account}</span>
                      {r.account_holder && <span className="text-muted-foreground">({r.account_holder})</span>}
                      <button
                        onClick={() => copy(r.account_no ?? '', `acc${r.id}`)}
                        className="rounded border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        {copied === `acc${r.id}` ? '복사됨 ✓' : '계좌 복사'}
                      </button>
                    </span>
                  ) : (
                    <span className="text-amber-600">계좌 미확인 — 거래처에 확인 필요</span>
                  )}
                </div>

                {r.items_summary && <p className="mt-1 text-[12px] text-muted-foreground">{r.items_summary}</p>}
                {r.memo && <p className="mt-1 text-[12px] text-muted-foreground">메모: {r.memo}</p>}
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  {r.requester_email.split('@')[0]} · {fmtDate(r.created_at)}
                  {r.doc_date && ` · 거래일 ${r.doc_date}`}
                  {r.status === 'done' && r.done_by_email && ` · ${r.done_by_email.split('@')[0]}가 ${r.done_at ? fmtDate(r.done_at) : ''} 이체 완료`}
                </p>

                <div className="mt-3 flex flex-wrap gap-2 text-[12px]">
                  {r.image_path && (
                    <button onClick={() => setImageViewId(r.id)} className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground">
                      원본 사진
                    </button>
                  )}
                  {isStaff && r.status === 'pending' && (
                    <button
                      onClick={() => mark(r.id, 'done')}
                      disabled={busyId === r.id}
                      className="rounded-lg bg-foreground px-3 py-1.5 font-medium text-background disabled:opacity-60"
                    >
                      이체 완료
                    </button>
                  )}
                  {isStaff && r.status === 'done' && (
                    <button
                      onClick={() => mark(r.id, 'undo')}
                      disabled={busyId === r.id}
                      className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground hover:text-foreground disabled:opacity-60"
                    >
                      완료 취소
                    </button>
                  )}
                  {(isStaff || (mine && r.status === 'pending')) && (
                    <button
                      onClick={() => remove(r.id)}
                      disabled={busyId === r.id}
                      className="rounded-lg border border-border px-3 py-1.5 text-muted-foreground hover:text-red-500 disabled:opacity-60"
                    >
                      삭제
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---------- 원본 이미지 모달 ---------- */}
      {imageViewId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setImageViewId(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/finance/transfer/image/${imageViewId}`}
            alt="영수증 원본"
            className="max-h-[90vh] max-w-full rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
