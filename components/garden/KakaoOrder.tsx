'use client';

import { useEffect, useState } from 'react';
import type { PurchaseRecord } from '@/lib/types';
import { toast } from '@/components/Toast';

// 발주 카톡 [발주] 버튼 + 미리보기 카드 — 발주 화면(GardenService)과 판매가 설정(GardenSalePrice)이 함께 쓴다.
// 판교 원두는 발주 권한이 없는 스탭이 저장하므로, 판매가를 정하는 대표가 그 자리에서 보낼 수 있게 분리(2026-11-03).
// 허용 계정에만 버튼이 보이고, 방은 서버의 로스터리 매핑으로 고정(오전송 방지) — 문구만 고칠 수 있다.

type Preview = { recId: string; room: string; message: string };

// 버튼 라벨 — 대기(전송기가 아직 안 집어감)와 완료를 구분해 보여준다
const labelOf = (status: string | undefined, sending: boolean) => {
  if (sending) return '…';
  if (status === 'pending') return '대기중';
  if (status === 'sent') return '발주됨 ✓';
  if (status === 'failed') return '실패·재시도';
  return '발주';
};

export function useKakaoOrder() {
  const [allowed, setAllowed] = useState(false);
  const [jobs, setJobs] = useState<Record<string, string>>({});
  const [sending, setSending] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  useEffect(() => {
    fetch('/api/kakao-notify', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!j) return;
        setAllowed(!!j.allowed);
        setJobs(j.jobs ?? {});
      });
  }, []);

  // 미리보기 모달 Escape 닫기 — 배경 클릭과 같은 동작을 키보드에도 연다
  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPreview(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  // 1단계 — 서버가 만든 전송 문구를 미리보기 카드로 연다
  const open = async (rec: PurchaseRecord) => {
    if (sending) return;
    setSending(rec.id);
    try {
      const pv = await fetch(`/api/kakao-notify?purchaseId=${encodeURIComponent(rec.id)}`, { cache: 'no-store' });
      const pj = await pv.json().catch(() => null);
      if (!pv.ok || !pj?.message) {
        toast(pj?.error ?? '미리보기를 불러오지 못했습니다.', 'error');
        return;
      }
      setPreview({ recId: rec.id, room: pj.room, message: pj.message });
    } finally {
      setSending(null);
    }
  };

  // 2단계 — [전송] 확정. 고친 문구가 그대로 잡에 실린다
  const confirm = async () => {
    if (!preview || sending) return;
    if (!preview.message.trim()) {
      toast('빈 메시지는 보낼 수 없습니다.', 'error');
      return;
    }
    setSending(preview.recId);
    try {
      const res = await fetch('/api/kakao-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseId: preview.recId, message: preview.message.trim() }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.job) {
        setJobs((m) => ({ ...m, [preview.recId]: j.job.status }));
        setPreview(null);
      } else if (j?.error) {
        toast(j.error, 'error');
      }
    } finally {
      setSending(null);
    }
  };

  const button = (rec: PurchaseRecord) => {
    if (!allowed) return null;
    const status = jobs[rec.id];
    return (
      <button
        onClick={() => open(rec)}
        // pending·sent 는 서버가 중복 등록을 막지만, 눌러도 변화가 없어 혼란만 주므로 비활성화
        disabled={sending === rec.id || status === 'pending' || status === 'sent'}
        className={status === 'sent' ? 'text-muted-foreground' : 'text-foreground hover:text-foreground'}
        style={{ background: 'none', border: 'none', cursor: status === 'sent' ? 'default' : 'pointer', fontSize: 11, flexShrink: 0, padding: 0 }}
        title="카톡방에 발주 메시지 전송"
      >
        {labelOf(status, sending === rec.id)}
      </button>
    );
  };

  const modal = preview && (
    <div
      onClick={() => setPreview(null)}
      role="dialog"
      aria-modal="true"
      aria-label="발주 메시지 전송"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
    >
      <div
        className="ta-card bg-background max-h-[92vh] w-full overflow-y-auto rounded-t-2xl sm:max-w-[420px] sm:rounded-md"
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
      >
        <div>
          <p className="ta-label" style={{ margin: 0 }}>발주 메시지 전송</p>
          <p className="text-body text-muted-foreground" style={{ margin: '4px 0 0' }}>
            <span className="text-foreground">[{preview.room}]</span> 방으로 전송됩니다 — 문구는 자유롭게 고칠 수 있어요
          </p>
        </div>
        <textarea
          autoFocus
          value={preview.message}
          onChange={(e) => setPreview((p) => (p ? { ...p, message: e.target.value } : p))}
          rows={7}
          className="ta-input"
          style={{ width: '100%', minWidth: 0, height: 'auto', padding: 10, fontSize: 13, lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit' }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => setPreview(null)} className="ta-btn" style={{ height: 34, paddingLeft: 14, paddingRight: 14 }}>
            취소
          </button>
          <button
            onClick={confirm}
            disabled={sending != null || !preview.message.trim()}
            className="ta-btn-primary"
            style={{ height: 34, paddingLeft: 14, paddingRight: 14 }}
          >
            {sending ? '전송 중…' : '전송'}
          </button>
        </div>
      </div>
    </div>
  );

  return { button, modal };
}
