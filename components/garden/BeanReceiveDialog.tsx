'use client';

import { useState } from 'react';
import type { PurchaseRecord } from '@/lib/types';
import { receiveTodo, type ReceiveTarget } from '@/lib/garden/receive';
import { toast } from '@/components/Toast';

// 원두 수령 창 — 택배를 받은 뒤 봉투를 보고 ① 로스팅 날짜 ② 영문 원두명을 확정하고,
// ③ 확정된 한글·영문 원두명으로 원두카드를 요청한다 (2026-11-19).
// 발주 때 적은 영문명은 임시라서, 여기서 봉투 표기를 촬영하거나 직접 타이핑해 확정한다.
// 촬영 결과는 입력칸에만 채운다 — 사람이 봉투와 대조하고 [저장]을 눌러야 확정된다.
// 원두카드 메일은 ③의 [원두카드 요청하기]를 누를 때만 나간다.
// 발주 리스트의 [수령]과 작업 보드([원두 수령]·수령 카드)가 이 창을 연다. 누를 수 있는 사람은 설정 › '원두 수령 담당'.

const todayKst = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

export default function BeanReceiveDialog({
  record,
  initial,
  onClose,
  onSaved,
}: {
  record: ReceiveTarget;
  /** 보드에서 봉투를 먼저 찍고 들어온 경우 — 읽은 값을 미리 채운다(확정은 저장을 눌러야) */
  initial?: { beanEn?: string | null; roastDate?: string | null };
  onClose: () => void;
  /** 저장·요청으로 기록이 바뀔 때마다 — 창은 스스로 닫는다(onClose) */
  onSaved: (updated: PurchaseRecord) => void;
}) {
  // 저장하면 최신 기록으로 갈아 끼워 다음 단계(원두카드 요청)로 넘어간다
  const [rec, setRec] = useState<ReceiveTarget>(record);
  const todo = receiveTodo(rec);
  const [stage, setStage] = useState<'form' | 'request'>(!todo.roastDate && !todo.beanEn ? 'request' : 'form');

  const confirmed = !!rec.beanEnConfirmed;
  // 확정 전의 임시 표기는 입력칸에 미리 넣지 않는다 — 날짜만 넣으려다 틀린 표기까지 확정되는 걸 막는다.
  // 대신 아래에 '발주 때 적은 표기'로 보여주고, 봉투와 같으면 눌러서 채운다.
  const tentative = !confirmed ? (rec.beanEn ?? '').trim() : '';
  const [roastDate, setRoastDate] = useState(rec.roastDate ?? initial?.roastDate ?? '');
  const [beanEn, setBeanEn] = useState(initial?.beanEn ?? (confirmed ? (rec.beanEn ?? '') : ''));
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(
    initial?.beanEn ? { text: '봉투에서 읽은 표기예요. 철자를 대조한 뒤 저장해 주세요.' } : null
  );

  const enTrim = beanEn.trim();
  // 바뀐 것만 보낸다 — 이미 확정된 영문명을 그대로 두면 다시 확정하지 않는다
  const sendDate = roastDate && roastDate !== (rec.roastDate ?? '') ? roastDate : '';
  const sendEn = enTrim && (!confirmed || enTrim !== (rec.beanEn ?? '').trim()) ? enTrim : '';
  const canSave = !saving && !scanning && (!!sendDate || !!sendEn);

  const scan = async (file: File) => {
    setScanning(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/garden-bean-scan', { method: 'POST', body: fd });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '인식에 실패했어요.');
      const x = j.extraction as { beanNameEn: string | null; roastDate: string | null };
      if (x.beanNameEn) setBeanEn(x.beanNameEn);
      if (x.roastDate && !roastDate) setRoastDate(x.roastDate);
      const got = [x.beanNameEn && '영문명', x.roastDate && !roastDate && '로스팅 날짜'].filter(Boolean);
      setMsg(
        got.length
          ? { text: `${got.join(' · ')}을(를) 읽었어요. 봉투와 철자를 대조한 뒤 저장해 주세요.` }
          : { text: '봉투에서 영문 표기를 읽지 못했어요. 라벨이 잘 보이게 다시 찍거나 직접 입력해 주세요.', error: true }
      );
    } catch (e) {
      setMsg({ text: (e as Error).message, error: true });
    } finally {
      setScanning(false);
    }
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/purchases/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rec.id, roastDate: sendDate || undefined, beanEn: sendEn || undefined }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? '수령 기재에 실패했습니다.');
      const updated = j as PurchaseRecord;
      onSaved(updated);
      setRec(updated);
      // 영문명까지 확정됐고 아직 요청 전이면 원두카드 요청 단계로, 아니면 닫는다
      if (receiveTodo(updated).cardRequest) {
        setStage('request');
      } else {
        toast(updated.beanEnConfirmed ? '수령 저장' : '수령 저장 — 영문명은 아직 미확정이에요');
        onClose();
      }
    } catch (e) {
      setMsg({ text: (e as Error).message, error: true });
    } finally {
      setSaving(false);
    }
  };

  // 원두카드 요청 — skip 이면 메일 없이 '요청 안 함'(기존 카드 사용)으로 닫는다
  const requestCard = async (skip: boolean) => {
    if (saving) return;
    setSaving(true);
    setMsg(null);
    try {
      const res = await fetch('/api/purchases/card-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rec.id, skip }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error ?? '요청에 실패했습니다.');
      onSaved(j.record as PurchaseRecord);
      const to = (j.sentTo as string[] | undefined) ?? [];
      toast(skip ? '원두카드 요청 없이 닫았어요' : `원두카드 요청을 보냈어요 — ${to.map((e) => e.split('@')[0]).join(', ')}`);
      onClose();
    } catch (e) {
      setMsg({ text: (e as Error).message, error: true });
      setSaving(false);
    }
  };

  const nameBox = (label: string, value: string) => (
    <div className="rounded-md bg-muted/40" style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="text-caption text-muted-foreground">{label}</span>
      <span className="text-body font-medium text-foreground" style={{ wordBreak: 'break-word' }}>{value}</span>
    </div>
  );

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="원두 수령"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
    >
      <div
        className="ta-card bg-background max-h-[92vh] w-full overflow-y-auto rounded-t-2xl sm:max-w-[420px] sm:rounded-md"
        onClick={(e) => e.stopPropagation()}
        style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
      >
        {stage === 'form' ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p className="ta-label" style={{ margin: 0 }}>원두 수령</p>
              {/* 한글 원두명은 발주 때 값 그대로 — 받은 봉투와 같은 원두인지 눈으로 확인만 한다 */}
              {nameBox(`한글 원두명 — 받은 원두가 맞는지 확인${rec.roastery ? ` · ${rec.roastery}` : ''}`, rec.bean)}
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="text-caption text-muted-foreground">로스팅 날짜 — 봉투에 찍힌 날짜</span>
              <input
                type="date"
                value={roastDate}
                max={todayKst()}
                onChange={(e) => setRoastDate(e.target.value)}
                className="ta-input tabular w-full"
              />
            </label>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="text-caption text-muted-foreground">
                영문 원두명 — 봉투 표기 그대로
                {confirmed ? ' · 확정됨' : ''}
              </span>
              <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
                <input
                  value={beanEn}
                  onChange={(e) => setBeanEn(e.target.value)}
                  placeholder="예: Ethiopia Gedeb Washed"
                  autoCapitalize="words"
                  autoCorrect="off"
                  spellCheck={false}
                  className="ta-input"
                  style={{ flex: 1, minWidth: 0 }}
                />
                <label
                  className="ta-btn"
                  style={{ height: 'auto', paddingLeft: 10, paddingRight: 10, fontSize: 13, flexShrink: 0, cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}
                  title="봉투 라벨을 찍으면 인쇄된 영문 표기를 읽어 채워요"
                >
                  {scanning ? '인식 중…' : '📷 봉투 촬영'}
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }}
                    disabled={scanning}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (file) scan(file);
                    }}
                  />
                </label>
              </div>
              {tentative && enTrim !== tentative && (
                <button
                  type="button"
                  onClick={() => setBeanEn(tentative)}
                  className="text-caption text-foreground"
                  style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', textAlign: 'left' }}
                >
                  발주 때 적은 표기: {tentative} — <span style={{ textDecoration: 'underline' }}>봉투와 같으면 눌러서 채우기</span>
                </button>
              )}
              <span className="text-caption text-muted-foreground">
                저장하면 이 표기가 확정되고, 다음 화면에서 원두카드를 요청해요. 지금 모르면 비워 두고 날짜만 저장해도 돼요.
              </span>
            </div>

            {msg && (
              <p className={`text-caption ${msg.error ? 'ta-error' : 'text-muted-foreground'}`} style={{ margin: 0 }}>
                {msg.text}
              </p>
            )}

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={onClose} className="ta-btn" style={{ flex: 1 }}>
                닫기
              </button>
              <button onClick={save} disabled={!canSave} className="ta-btn-primary" style={{ flex: 2 }}>
                {saving ? '저장 중…' : sendEn ? '영문명 확정 · 저장' : '저장'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="ta-label" style={{ margin: 0 }}>원두카드 요청</p>
              <p className="text-body text-muted-foreground" style={{ margin: '4px 0 0' }}>
                {rec.cardRequested
                  ? rec.cardRequested.note
                    ? '요청 없이 닫아 둔 원두예요. 필요하면 지금 요청할 수 있어요.'
                    : '이미 요청한 원두예요. 다시 보내려면 아래 버튼을 누르세요.'
                  : '아래 이름으로 원두카드 담당자에게 제작 요청 메일을 보내요. 봉투와 한 번 더 대조해 주세요.'}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {nameBox('한글 원두명', rec.bean)}
              {nameBox('영문 원두명 (확정)', rec.beanEn ?? '')}
            </div>

            {msg && (
              <p className={`text-caption ${msg.error ? 'ta-error' : 'text-muted-foreground'}`} style={{ margin: 0 }}>
                {msg.text}
              </p>
            )}

            <button onClick={() => requestCard(false)} disabled={saving} className="ta-btn-primary w-full">
              {saving ? '보내는 중…' : rec.cardRequested && !rec.cardRequested.note ? '원두카드 다시 요청하기' : '원두카드 요청하기'}
            </button>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => { setMsg(null); setStage('form'); }}
                disabled={saving}
                className="text-caption text-foreground hover:underline"
                style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
              >
                ‹ 영문명·날짜 고치기
              </button>
              {!rec.cardRequested ? (
                <button
                  type="button"
                  onClick={() => requestCard(true)}
                  disabled={saving}
                  className="text-caption text-muted-foreground hover:underline"
                  style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                >
                  요청 안 함 — 기존 카드를 그대로 써요
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="text-caption text-muted-foreground hover:underline"
                  style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer' }}
                >
                  닫기
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
