'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PurchaseRecord, RoasteryAssets } from '@/lib/types';
import { fmtDate } from '@/lib/garden/format';

// 원두카드 인쇄 — GS 필터 원두 인포 카드(일러스트 원본)를 웹으로 재현.
// A4 세로 1장 = 3×3 카드 9장 + 재단선(+). 발주 기록으로 프리필하고 인쇄 전 수정 가능.
// 폰트: 영문 헤더 Elza Narrow / 영문 본문 Elza Narrow Light / 국문 Freesentation 3 Light.
// Elza는 인쇄하는 기기에 설치돼 있어야 정확히 나온다(미설치 시 Freesentation 폴백).

const COLS = 3;
const ROWS = 3;
const MARGIN_MM = 10; // 시트 바깥 여백
const CELL_W = (210 - MARGIN_MM * 2) / COLS; // 63.33mm
const CELL_H = (297 - MARGIN_MM * 2) / ROWS; // 92.33mm


export default function BeanCardPrint({ recordId }: { recordId: string | null }) {
  const [records, setRecords] = useState<PurchaseRecord[]>([]);
  const [assets, setAssets] = useState<RoasteryAssets>({});
  const [loaded, setLoaded] = useState(false);
  // 불러온 발주 기록 — URL(recordId)로 진입했거나 드롭다운에서 선택
  const [selectedId, setSelectedId] = useState<string | null>(recordId);

  // 카드 문구 — 발주 기록으로 프리필, 인쇄 전 수정 가능
  const [roastery, setRoastery] = useState('');
  const [beanEn, setBeanEn] = useState('');
  const [beanKo, setBeanKo] = useState('');
  const [notes, setNotes] = useState('');
  const [translating, setTranslating] = useState(false); // 한글 원두명 → 영문 AI 변환 중
  const [translateMsg, setTranslateMsg] = useState<string | null>(null);

  const translateEn = async () => {
    if (translating || !beanKo.trim()) return;
    setTranslating(true);
    setTranslateMsg(null);
    try {
      const res = await fetch('/api/garden-bean-translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bean: beanKo.trim() }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '영문 변환에 실패했어요.');
      setBeanEn(j.beanEn);
    } catch (err) {
      setTranslateMsg(`⚠ ${(err as Error).message}`);
    } finally {
      setTranslating(false);
    }
  };

  useEffect(() => {
    Promise.all([
      fetch('/api/purchases', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])),
      fetch('/api/garden-roastery-assets', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : {})),
    ]).then(([recs, a]) => {
      setRecords(Array.isArray(recs) ? recs : []);
      setAssets(a ?? {});
      setLoaded(true);
    });
  }, []);

  const record = useMemo(
    () => records.find((r) => r.id === selectedId) ?? null,
    [records, selectedId]
  );

  // 불러오기 목록 — 최근 발주순
  const sortedRecords = useMemo(
    () => records.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [records]
  );

  // 기록 로드 시 1회 프리필 — 노트는 원본 카드처럼 두 줄로 나눠 보여주기 좋게 쉼표 중간에서 줄바꿈
  useEffect(() => {
    if (!record) return;
    setRoastery(record.roastery ?? '');
    setBeanEn(record.beanEn ?? '');
    setBeanKo(record.bean ?? '');
    setNotes(splitNotes(record.tastingNotes ?? ''));
  }, [record]);

  const asset = assets[roastery] ?? {};

  return (
    <div>
      {/* 편집 패널 — 화면 전용, 인쇄에는 안 나옴 */}
      <div className="print:hidden mx-auto max-w-[820px] px-6 py-6">
        {/* 카드 해체(2026-08-08) — 페이지 최상위 섹션은 박스 없이 */}
        <div className="min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <p className="ta-label">원두카드 인쇄 — A4 · 카드 9장 · 재단선 포함</p>
            <button onClick={() => window.print()} className="ta-btn-primary" style={{ height: 34, paddingLeft: 16, paddingRight: 16 }}>
              인쇄 (⌘P)
            </button>
          </div>
          {/* 저장된 발주 원두 불러오기 — 선택하면 아래 칸이 자동 기입된다 */}
          <select
            value={selectedId ?? ''}
            onChange={(e) => setSelectedId(e.target.value || null)}
            className="ta-input w-full"
            disabled={!loaded}
          >
            <option value="">
              {!loaded
                ? '발주 기록 불러오는 중…'
                : sortedRecords.length
                  ? '저장된 원두 불러오기 — 선택하면 자동 기입'
                  : '저장된 발주 기록이 없어요 — 필터 원두 발주에서 먼저 저장하세요'}
            </option>
            {sortedRecords.map((r) => (
              <option key={r.id} value={r.id}>
                {r.bean}
                {r.roastery ? ` · ${r.roastery}` : ''} · {fmtDate(r.createdAt)}
              </option>
            ))}
          </select>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <input value={roastery} onChange={(e) => setRoastery(e.target.value)} placeholder="로스터리 (예: UFO coffee)" className="ta-input w-full" />
            <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
              <input
                value={beanEn}
                onChange={(e) => setBeanEn(e.target.value)}
                placeholder="영문 원두명 (예: Rwanda Bombo Honey)"
                className="ta-input"
                style={{ flex: 1, minWidth: 0 }}
              />
              {/* 한글 원두명 → 영문 표기 AI 변환 */}
              <button
                onClick={translateEn}
                disabled={translating || !beanKo.trim()}
                className="ta-btn"
                style={{ height: 'auto', paddingLeft: 10, paddingRight: 10, fontSize: 13, flexShrink: 0 }}
                title="한글 원두명을 업계 표준 영문 표기로 자동 변환"
              >
                {translating ? '변환 중…' : '영문 자동'}
              </button>
            </div>
            <input value={beanKo} onChange={(e) => setBeanKo(e.target.value)} placeholder="한글 원두명 (예: 르완다 봄보 허니)" className="ta-input w-full" />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={'테이스팅 노트 — 줄바꿈 그대로 인쇄\n(예: 말린 무화과, 오렌지\n아카시아, 꿀)'}
              className="ta-input w-full"
              rows={2}
              style={{ resize: 'vertical', height: 'auto', paddingTop: 8, paddingBottom: 8 }}
            />
          </div>
          {translateMsg && (
            <p className="text-[13px] text-muted-foreground" style={{ margin: 0 }}>{translateMsg}</p>
          )}
          <p className="text-[11px] text-muted-foreground" style={{ margin: 0 }}>
            {asset.logo || asset.qr
              ? '로고·QR은 설정에 등록된 이미지가 자동 배치됩니다.'
              : (
                <>이 로스터리의 로고·QR이 아직 없어요 — <a href="/garden/settings" className="underline">설정 → 발주 드롭다운 관리</a>에서 등록하면 카드에 자동 배치됩니다.</>
              )}
            {' '}인쇄 대화상자에서 여백 &apos;없음&apos;, 배율 100%로 설정하세요.
          </p>
        </div>
      </div>

      {/* A4 시트 — 3×3 동일 카드 + 재단선 */}
      <div className="bc-wrap">
        <div className="bc-sheet">
          {Array.from({ length: COLS * ROWS }, (_, i) => (
            <div key={i} className="bc-cell">
              <Card roastery={roastery} beanEn={beanEn} beanKo={beanKo} notes={notes} logo={asset.logo} qr={asset.qr} />
            </div>
          ))}
          <CropMarks />
        </div>
      </div>

      <style>{`
        .bc-wrap { display: flex; justify-content: center; padding: 0 0 40px; }
        .bc-sheet {
          position: relative;
          width: 210mm; height: 297mm;
          background: #fff; color: #111;
          padding: ${MARGIN_MM}mm;
          box-sizing: border-box;
          display: grid;
          grid-template-columns: repeat(${COLS}, ${CELL_W}mm);
          grid-template-rows: repeat(${ROWS}, ${CELL_H}mm);
          box-shadow: 0 2px 24px rgba(0,0,0,.35);
          -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .bc-cell { overflow: hidden; }
        /* 영문 — 헤더 Elza Narrow, 본문 Elza Narrow Light (미설치 시 Freesentation 폴백) */
        .bc-label {
          font-family: 'Elza Narrow', Elza, 'Freesentation', sans-serif;
          font-weight: 600; font-size: 7.5pt; letter-spacing: .06em;
          color: #111; text-transform: uppercase;
        }
        .bc-en {
          font-family: 'Elza Narrow', Elza, 'Freesentation', sans-serif;
          font-weight: 300; font-size: 10.5pt; line-height: 1.35; color: #111;
        }
        /* 국문 — Freesentation 3 Light */
        .bc-ko { font-family: 'Freesentation', sans-serif; font-weight: 300; font-size: 8.5pt; line-height: 1.55; color: #333; }
        @page { size: A4 portrait; margin: 0; }
        @media print {
          body { background: #fff !important; }
          .bc-wrap { padding: 0; }
          .bc-sheet { box-shadow: none; }
        }
      `}</style>
    </div>
  );
}

// 테이스팅 노트를 원본 카드처럼 두 줄로 — 쉼표 항목 기준 중간에서 줄바꿈
function splitNotes(notes: string): string {
  if (!notes || notes.includes('\n')) return notes;
  const parts = notes.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length < 3) return notes;
  const mid = Math.ceil(parts.length / 2);
  return `${parts.slice(0, mid).join(', ')}\n${parts.slice(mid).join(', ')}`;
}

function Card({
  roastery,
  beanEn,
  beanKo,
  notes,
  logo,
  qr,
}: {
  roastery: string;
  beanEn: string;
  beanKo: string;
  notes: string;
  logo?: string;
  qr?: string;
}) {
  return (
    <div
      style={{
        width: '100%', height: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        textAlign: 'center', paddingTop: '9mm', boxSizing: 'border-box',
      }}
    >
      <p className="bc-label" style={{ margin: 0 }}>ROASTERY</p>
      <p className="bc-en" style={{ margin: '1.2mm 0 0' }}>{roastery || ' '}</p>
      {(logo || qr) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2mm', marginTop: '2.2mm', height: '9.5mm' }}>
          {logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" style={{ maxHeight: '9.5mm', maxWidth: '18mm', objectFit: 'contain' }} />
          )}
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="" style={{ height: '9.5mm', width: '9.5mm', objectFit: 'contain' }} />
          )}
        </div>
      )}
      <p className="bc-label" style={{ margin: '4.5mm 0 0' }}>NAME</p>
      <p className="bc-en" style={{ margin: '1.2mm 0 0', maxWidth: '56mm' }}>{beanEn || ' '}</p>
      <p className="bc-ko" style={{ margin: '0.4mm 0 0', maxWidth: '56mm' }}>{beanKo || ' '}</p>
      {/* 원본의 작은 사각 구분점 */}
      <div style={{ width: '1.4mm', height: '1.4mm', background: '#111', marginTop: '4.2mm' }} />
      <p className="bc-label" style={{ margin: '4.2mm 0 0' }}>NOTE</p>
      <p className="bc-ko" style={{ margin: '1.2mm 0 0', maxWidth: '56mm', whiteSpace: 'pre-line' }}>{notes || ' '}</p>
    </div>
  );
}

// 격자 교차점 16곳의 재단선(+) — 원본 PDF와 동일한 표기
function CropMarks() {
  const marks = [];
  for (let r = 0; r <= ROWS; r++) {
    for (let c = 0; c <= COLS; c++) {
      marks.push(
        <span
          key={`${r}-${c}`}
          style={{
            position: 'absolute',
            left: `${MARGIN_MM + c * CELL_W}mm`,
            top: `${MARGIN_MM + r * CELL_H}mm`,
            width: '4mm', height: '4mm',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
          }}
        >
          <span style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: '0.15mm', background: '#999' }} />
          <span style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: '0.15mm', background: '#999' }} />
        </span>
      );
    }
  }
  return <>{marks}</>;
}
