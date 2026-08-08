'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { BalanceBreakdown, PayBasis, TransferExtraction, TransferRequestRow } from '@/lib/finance/transfer';
import { breakdownBalance } from '@/lib/finance/transfer';

interface Props {
  role: string | null; // finance 역할 — 완료 처리는 admin/classifier 만
  email: string;
  mode: 'dashboard' | 'history'; // 대시보드=업로드+최근 10건, 내역=월별 전체
}

interface Draft {
  brand: '' | 'staffmeal' | 'garden'; // ''=미선택 — 등록 전 필수 선택
  vendor_name: string;
  doc_date: string;
  amount: string;
  items_summary: string;
  bank: string;
  account_no: string;
  account_holder: string;
  memo: string;
}

// 여러 장 일괄 인식 시 큐에 담아두는 개별 결과(아직 확인창에 안 뜬 나머지)
interface ParsedItem {
  file: File;
  draft: Draft;
  breakdown: BalanceBreakdown;
  otherAmounts: { label: string; amount: number }[];
  accountFromBook: boolean;
}

const BRAND_LABEL: Record<'staffmeal' | 'garden', string> = {
  staffmeal: '스탭밀',
  garden: '가든서비스',
};

const won = (n: number) => '₩' + Math.round(n).toLocaleString('ko-KR');
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const fmtYm = (ym: string) => {
  const [y, m] = ym.split('-');
  return `${y}년 ${Number(m)}월`;
};

// EXIF 회전을 반영해 비트맵 로드 (옵션 미지원 브라우저는 기본 동작 폴백)
async function loadBitmap(file: File | Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return await createImageBitmap(file);
  }
}

// 폰 사진(수 MB)을 서버 한도·AI 비용에 맞게 축소 (긴 변 1600px JPEG)
async function resizeImage(file: File): Promise<File> {
  try {
    const bmp = await loadBitmap(file);
    const scale = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.8));
    if (!blob) return file;
    return new File([blob], 'receipt.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

// 옆으로 눕혀 찍힌 영수증을 정면(글자 바로 서게)으로 회전 — 각도는 AI가 판정
async function rotateImage(file: File, deg: 90 | 180 | 270): Promise<File> {
  try {
    const bmp = await loadBitmap(file);
    const swap = deg === 90 || deg === 270;
    const canvas = document.createElement('canvas');
    canvas.width = swap ? bmp.height : bmp.width;
    canvas.height = swap ? bmp.width : bmp.height;
    const ctx = canvas.getContext('2d')!;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((deg * Math.PI) / 180);
    ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) return file;
    return new File([blob], 'receipt.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export default function TransferPanel({ role, email, mode }: Props) {
  const isDashboard = mode === 'dashboard';
  const isStaff = ['admin', 'classifier'].includes(role ?? '');
  const fileInput = useRef<HTMLInputElement>(null);
  const resizedRef = useRef<File | null>(null);

  const [parsing, setParsing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [breakdown, setBreakdown] = useState<BalanceBreakdown | null>(null);
  const [payBasis, setPayBasis] = useState<PayBasis | null>(null);
  const [otherAmounts, setOtherAmounts] = useState<{ label: string; amount: number }[]>([]);
  const [accountFromBook, setAccountFromBook] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // 여러 장 일괄: 확인창엔 현재 1장(draft), 나머지는 큐(pendingParsed)에서 대기
  const [pendingParsed, setPendingParsed] = useState<ParsedItem[]>([]);
  const [batchTotal, setBatchTotal] = useState(0);
  // 완료 알림(푸시) 미구독자에게 첫 등록 후 신청 카드로 유도
  const [pushOn, setPushOn] = useState<boolean | null>(null);
  const [notifyPrompt, setNotifyPrompt] = useState(false);

  const [filter, setFilter] = useState<'all' | 'pending' | 'done'>('all');
  const [rows, setRows] = useState<TransferRequestRow[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [imageViewId, setImageViewId] = useState<number | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const res = await fetch('/api/finance/transfer');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '목록을 불러오지 못했어요.');
      setRows(j.requests as TransferRequestRow[]);
    } catch (e) {
      setListError((e as Error).message);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  // 이 기기에서 완료 알림(푸시)이 켜져 있는지 확인 — 안 켜져 있으면 첫 등록 후 유도
  useEffect(() => {
    (async () => {
      try {
        const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.getRegistration() : null;
        const sub = reg ? await reg.pushManager.getSubscription() : null;
        setPushOn(!!sub);
      } catch {
        setPushOn(false);
      }
    })();
  }, []);

  function goToNotify() {
    setNotifyPrompt(false);
    document.getElementById('notify-optin')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function dismissNotify() {
    setNotifyPrompt(false);
    try {
      localStorage.setItem('transfer_notify_dismissed', '1');
    } catch {
      /* private mode 등 무시 */
    }
  }

  // ---------- 업로드 → AI 인식(여러 장 병렬) ----------
  async function onPickFiles(files: File[]) {
    if (!files.length) return;
    setError(null);
    setNotice(null);
    setDraft(null);
    setPendingParsed([]);
    setBatchTotal(files.length);
    setParsing(true);
    try {
      // 모든 장을 동시에 리사이즈+인식 → 총 대기시간 ≈ 한 장 처리시간
      const results = await Promise.all(files.map(parseOne));
      const items = results.filter((x): x is ParsedItem => x !== null);
      const failed = files.length - items.length;
      setBatchTotal(items.length);
      if (items.length === 0) {
        setError('사진을 인식하지 못했어요. 다시 시도해주세요.');
        return;
      }
      loadItem(items[0]); // 첫 장은 확인창에 바로
      setPendingParsed(items.slice(1)); // 나머지는 큐에서 대기
      if (failed > 0) setNotice(`${failed}장은 인식 실패 — 나머지 ${items.length}장을 확인하세요.`);
    } finally {
      setParsing(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  // 한 장을 리사이즈+인식(+눕은 사진 정면 회전)해 큐 항목으로. 실패 시 null.
  async function parseOne(f: File): Promise<ParsedItem | null> {
    try {
      let resized = await resizeImage(f);
      const fd = new FormData();
      fd.append('file', resized);
      const res = await fetch('/api/finance/transfer/parse', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '인식 실패');
      const ex = j.extraction as TransferExtraction;
      if (ex.rotation === 90 || ex.rotation === 180 || ex.rotation === 270) {
        resized = await rotateImage(resized, ex.rotation);
      }
      return {
        file: resized,
        breakdown: breakdownBalance(ex),
        otherAmounts: ex.other_amounts ?? [],
        accountFromBook: !!j.savedAccount && !!ex.account_no,
        draft: {
          brand: ex.brand ?? '', // AI가 확신 못하면 '' — 확인창에서 직접 선택해야 등록됨
          vendor_name: ex.vendor_name ?? '',
          doc_date: ex.doc_date ?? '',
          amount: ex.amount != null ? String(ex.amount) : '',
          items_summary: ex.items_summary ?? '',
          bank: ex.bank ?? '',
          account_no: ex.account_no ?? '',
          account_holder: ex.account_holder ?? '',
          memo: '',
        },
      };
    } catch {
      return null;
    }
  }

  // 큐 항목을 확인창(단일 draft 상태)에 올림
  function loadItem(item: ParsedItem) {
    resizedRef.current = item.file;
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(item.file);
    });
    setDraft(item.draft);
    setBreakdown(item.breakdown);
    setPayBasis(null);
    setOtherAmounts(item.otherAmounts);
    setAccountFromBook(item.accountFromBook);
    setError(null);
  }

  // 다음 장으로 넘어가기(등록·건너뛰기 후). 남은 게 없으면 확인창 닫기.
  function advanceNext() {
    const [next, ...rest] = pendingParsed;
    if (next) {
      loadItem(next);
      setPendingParsed(rest);
    } else {
      closeDraft();
    }
  }

  // AI 방향 판정이 빗나간 경우 수동 보정 — 누를 때마다 시계방향 90°
  async function rotateManually() {
    if (!resizedRef.current) return;
    const rotated = await rotateImage(resizedRef.current, 90);
    resizedRef.current = rotated;
    setPreviewUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return URL.createObjectURL(rotated);
    });
  }

  function closeDraft() {
    setDraft(null);
    setBreakdown(null);
    setPayBasis(null);
    setOtherAmounts([]);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    resizedRef.current = null;
    setPendingParsed([]);
    setBatchTotal(0);
    setError(null);
  }

  // ---------- 확인 → 등록 ----------
  async function submit() {
    if (!draft) return;
    const amount = Number(draft.amount.replace(/[,\s]/g, ''));
    if (!draft.brand) return setError('스탭밀/가든서비스 중 어느 매입인지 선택하세요.');
    if (!draft.vendor_name.trim()) return setError('거래처명을 입력하세요.');
    if (!Number.isFinite(amount) || amount <= 0) return setError('금액을 확인하세요.');
    setSubmitting(true);
    setError(null);
    try {
      // 이체하는 사람이 "이 금액이 무엇인지" 알 수 있게 지급 기준을 메모에 남긴다
      const basisNote =
        breakdown && payBasis && payBasis !== 'current'
          ? payBasis === 'prev'
            ? `이전 미수금만 지급${breakdown.current != null ? ` (이번 발주 ${won(breakdown.current)} 제외)` : ''}`
            : `미수금 포함 총액 지급${
                breakdown.prev != null && breakdown.current != null
                  ? ` (미수 ${won(breakdown.prev)} + 이번 ${won(breakdown.current)})`
                  : ''
              }`
          : '';
      const memo = [draft.memo.trim(), basisNote].filter(Boolean).join(' · ');
      const fd = new FormData();
      if (resizedRef.current) fd.append('file', resizedRef.current);
      fd.append('fields', JSON.stringify({ ...draft, memo, amount }));
      const res = await fetch('/api/finance/transfer', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || '등록에 실패했어요.');
      setNotice(
        `${draft.vendor_name} ${won(amount)} 등록${pendingParsed.length ? ` · 남은 ${pendingParsed.length}장 확인` : ' — 모두 완료'}`,
      );
      // 배치의 마지막 등록을 마쳤고, 완료 알림을 아직 안 켰고, 유도카드가 있고, 거절한 적 없으면 안내
      if (
        pendingParsed.length === 0 &&
        pushOn === false &&
        typeof document !== 'undefined' &&
        document.getElementById('notify-optin') &&
        !localStorage.getItem('transfer_notify_dismissed')
      ) {
        setNotifyPrompt(true);
      }
      loadList();
      advanceNext(); // 남은 장이 있으면 다음 확인창, 없으면 닫힘
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  // ---------- 리스트 액션 ----------
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

  const pendingRows = rows.filter((r) => r.status === 'pending');
  const pendingSum = pendingRows.reduce((s, r) => s + Number(r.amount), 0);

  // 대시보드=최근 10건(상태 무관), 내역=필터 적용 후 월별 그룹
  const visible = isDashboard ? rows.slice(0, 10) : rows.filter((r) => filter === 'all' || r.status === filter);
  const months: [string, TransferRequestRow[]][] = [];
  if (!isDashboard) {
    const map = new Map<string, TransferRequestRow[]>();
    for (const r of visible) {
      const ym = r.created_at.slice(0, 7);
      if (!map.has(ym)) map.set(ym, []);
      map.get(ym)!.push(r);
    }
    months.push(...Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0])));
  }

  const inputCls =
    'w-full rounded-lg border border-border bg-background px-3 py-2 text-[14px] text-foreground outline-none focus:border-foreground/40';
  const labelCls = 'text-[12px] text-muted-foreground';

  const card = (r: TransferRequestRow) => {
    const account = [r.bank, r.account_no].filter(Boolean).join(' ');
    const mine = r.requester_email === email;
    return (
      <div key={r.id} className="rounded-xl bg-muted/40 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-2 text-[15px] font-medium">
            {r.vendor_name}
            {r.brand && (
              <span
                className={`rounded px-1.5 py-0.5 text-[10px] font-normal ${
                  r.brand === 'staffmeal' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-foreground/10 text-foreground'
                }`}
              >
                {BRAND_LABEL[r.brand]}
              </span>
            )}
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-normal ${
                r.status === 'pending' ? 'bg-amber-500/15 text-amber-600' : 'bg-foreground/10 text-muted-foreground'
              }`}
            >
              {r.status === 'pending' ? '대기' : '완료'}
            </span>
          </span>
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
  };

  const monthSummary = (list: TransferRequestRow[]) => {
    const p = list.filter((r) => r.status === 'pending');
    const d = list.filter((r) => r.status === 'done');
    const parts = [];
    if (p.length) parts.push(`대기 ${p.length}건 ${won(p.reduce((s, r) => s + Number(r.amount), 0))}`);
    if (d.length) parts.push(`완료 ${d.length}건 ${won(d.reduce((s, r) => s + Number(r.amount), 0))}`);
    return parts.join(' · ');
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ---------- 업로드 (대시보드 전용) ---------- */}
      {isDashboard && (
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="m-0 text-[15px] font-medium">송금 요청</h2>
          <p className="mt-1 text-[13px] text-muted-foreground">
            거래명세서·영수증 사진을 올리면 거래처, 금액, 입금 계좌를 자동으로 읽어요. <b>여러 장을 한 번에</b> 올리면
            동시에 인식하고, 한 장씩 확인해 등록하면 송금 담당자 리스트에 올라가요.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => onPickFiles(Array.from(e.target.files ?? []))}
          />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={parsing}
            className="mt-4 w-full rounded-xl border border-dashed border-border bg-background py-6 text-[14px] text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:opacity-60 sm:w-auto sm:px-10"
          >
            {parsing ? `인식 중…${batchTotal > 1 ? ` (${batchTotal}장)` : ''}` : '📷 사진 촬영 / 여러 장 선택'}
          </button>
          {notice && <p className="mt-3 text-[13px]" style={{ color: 'hsl(var(--number-colored))' }}>{notice}</p>}
          {error && !draft && <p className="mt-3 text-[13px] text-red-500">{error}</p>}
          {notifyPrompt && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-muted/40 p-3 text-[13px]">
              <span>🔔 내가 올린 송금이 <b>이체 완료되면 알림</b>으로 바로 알려드려요.</span>
              <span className="hidden flex-1 sm:block" />
              <button
                onClick={goToNotify}
                className="rounded-lg bg-foreground px-3 py-1.5 text-[12px] font-medium text-background"
              >
                알림 켜러 가기 ↓
              </button>
              <button
                onClick={dismissNotify}
                className="rounded-lg border border-border px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground"
              >
                다음에
              </button>
            </div>
          )}
        </section>
      )}

      {/* ---------- 확인창 ---------- */}
      {draft && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6" onClick={closeDraft}>
          <div
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:max-w-[520px] sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="m-0 text-[15px] font-medium">
              인식 결과 확인
              {batchTotal > 1 && (
                <span className="ml-2 text-[12px] font-normal text-muted-foreground">
                  {batchTotal - pendingParsed.length} / {batchTotal}장
                </span>
              )}
            </h3>
            <p className="mt-1 text-[12px] text-muted-foreground">
              잘못 읽은 부분은 고친 뒤 등록하세요.
              {accountFromBook && ' 계좌는 이전에 확인된 거래처 계좌로 채웠어요.'}
            </p>

            {previewUrl && (
              <div className="relative mt-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="영수증 미리보기" className="max-h-[180px] w-full rounded-lg border border-border object-contain" />
                <button
                  onClick={rotateManually}
                  className="absolute bottom-2 right-2 rounded-lg border border-border bg-card/90 px-2.5 py-1 text-[12px] text-muted-foreground hover:text-foreground"
                  title="사진이 눕어 보이면 눌러서 돌리세요"
                >
                  ↻ 90°
                </button>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="col-span-2 flex flex-col gap-1">
                <span className={labelCls}>
                  브랜드 (필수){!draft.brand && <span className="ml-1 text-amber-600">— 어느 매입인지 선택하세요</span>}
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {(['staffmeal', 'garden'] as const).map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setDraft({ ...draft, brand: b })}
                      aria-pressed={draft.brand === b}
                      className={`rounded-lg border py-2.5 text-[14px] transition-colors ${
                        draft.brand === b
                          ? b === 'staffmeal'
                            ? 'border-emerald-600 bg-emerald-600 font-medium text-white'
                            : 'border-foreground bg-foreground font-medium text-background'
                          : 'border-border bg-background text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {BRAND_LABEL[b]}
                    </button>
                  ))}
                </div>
              </div>
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
              {/* 미수금 — 이번 발주만/미수만/합계 중 무엇을 보낼지 고른다.
                  명세서마다 총잔액에 이번 발주가 포함되기도 하고 아니기도 해서 계산식을 함께 보여준다 */}
              {breakdown && breakdown.options.length > 1 && (
                <div className="col-span-2 -mt-1 flex flex-col gap-1.5 rounded-lg bg-muted/40 px-3 py-2.5">
                  <span className="text-[12px] font-medium">지급 기준</span>
                  <div className="flex flex-wrap gap-1.5">
                    {breakdown.options.map((o) => {
                      const on = payBasis ? payBasis === o.key : String(o.amount) === draft.amount;
                      return (
                        <button
                          key={o.key}
                          onClick={() => {
                            setPayBasis(o.key);
                            setDraft({ ...draft, amount: String(o.amount) });
                          }}
                          className={`rounded-md border px-2.5 py-1 text-[12px] transition-colors ${
                            on ? 'border-foreground bg-foreground text-background' : 'border-border text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {o.label} {won(o.amount)}
                        </button>
                      );
                    })}
                  </div>
                  {breakdown.note && (
                    <span
                      className="text-[11.5px]"
                      style={{ color: breakdown.totalIncludesCurrent === null ? 'hsl(0 72% 45%)' : undefined }}
                    >
                      {breakdown.note}
                    </span>
                  )}
                </div>
              )}
              {breakdown && breakdown.options.length <= 1 && breakdown.prev != null && breakdown.prev > 0 && (
                <div className="col-span-2 -mt-1 text-[12px] text-muted-foreground">
                  이전 미수금 {won(breakdown.prev)}이 함께 잡혀 있어요.
                </div>
              )}
              {/* 우리 항목에 없는 금액 — 담당자에게 알림도 나가지만 올린 사람도 바로 보게 한다 */}
              {otherAmounts.length > 0 && (
                <div
                  className="col-span-2 -mt-1 flex flex-col gap-1 rounded-lg border px-3 py-2.5"
                  style={{ borderColor: 'hsl(0 72% 45% / 0.4)' }}
                >
                  <span className="text-[12px] font-medium" style={{ color: 'hsl(0 72% 45%)' }}>
                    명세서에 확인이 필요한 금액이 있어요
                  </span>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {otherAmounts.map((o, i) => (
                      <span key={i} className="text-[12px]">
                        {o.label} <b>{won(o.amount)}</b>
                      </span>
                    ))}
                  </div>
                  <span className="text-[11.5px] text-muted-foreground">
                    금액에 반영할지 확인해 주세요. 담당자에게 알림도 보냈어요.
                  </span>
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
              <button
                onClick={batchTotal > 1 ? advanceNext : closeDraft}
                disabled={submitting}
                className="flex-1 rounded-xl border border-border py-2.5 text-[14px] text-muted-foreground hover:text-foreground disabled:opacity-60"
              >
                {batchTotal > 1 ? '이 장 건너뛰기' : '취소'}
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="flex-[2] rounded-xl bg-foreground py-2.5 text-[14px] font-medium text-background disabled:opacity-60"
              >
                {submitting ? '등록 중…' : pendingParsed.length ? '등록 · 다음 장 →' : '확인 — 송금 대기에 등록'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- 리스트 ---------- */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <h2 className="m-0 text-[15px] font-medium">{isDashboard ? '송금 현황' : '송금 내역'}</h2>
          {isDashboard ? (
            <Link href="/dashboard/history" className="text-[13px] text-muted-foreground hover:text-foreground">
              전체 내역 →
            </Link>
          ) : (
            <div className="flex gap-1 rounded-lg border border-border p-0.5 text-[13px]">
              {(['all', 'pending', 'done'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={`rounded-md px-3 py-1 ${filter === t ? 'bg-foreground text-background' : 'text-muted-foreground'}`}
                >
                  {t === 'all' ? '전체' : t === 'pending' ? '대기' : '완료'}
                </button>
              ))}
            </div>
          )}
        </div>
        {pendingRows.length > 0 && (
          <p className="mt-2 text-[13px] text-muted-foreground">
            대기 합계 <span className="font-medium text-foreground">{won(pendingSum)}</span> · {pendingRows.length}건
          </p>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {loadingList && <p className="text-[13px] text-muted-foreground">불러오는 중…</p>}
          {!loadingList && listError && (
            <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-[13px]">
              <p className="m-0">{listError}</p>
              <button onClick={loadList} className="mt-2 rounded border border-border px-2 py-1 text-[12px] text-muted-foreground hover:text-foreground">
                다시 시도
              </button>
            </div>
          )}
          {!loadingList && !listError && visible.length === 0 && (
            <p className="text-[13px] text-muted-foreground">
              {isDashboard ? '아직 송금 요청이 없어요.' : filter === 'pending' ? '대기 중인 송금이 없어요.' : filter === 'done' ? '완료된 송금이 없어요.' : '송금 내역이 없어요.'}
            </p>
          )}

          {isDashboard
            ? visible.map(card)
            : months.map(([ym, list]) => (
                <div key={ym} className="flex flex-col gap-3">
                  <div className="mt-2 flex items-baseline justify-between border-b border-border pb-1.5 first:mt-0">
                    <h3 className="m-0 text-[14px] font-medium">{fmtYm(ym)}</h3>
                    <span className="text-[12px] text-muted-foreground">{monthSummary(list)}</span>
                  </div>
                  {list.map(card)}
                </div>
              ))}
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
