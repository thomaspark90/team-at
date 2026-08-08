'use client';

import { useEffect, useMemo, useState } from 'react';
import type { PricingSettings, PurchaseRecord } from '@/lib/types';
import { DEFAULT_SETTINGS, normalize, priceAtMult } from '@/lib/pricing';

// 판매가 설정 전용 화면 — 발주(GardenService)에서 저장된 기록의 판매가를 책정·공유한다.
// 발주와 권한이 분리돼 있어(saleprice 탭) 책정 담당자만 이 화면을 쓴다.

// 인라인 스타일에서 참조할 midday 토큰 (HSL 변수)
const C = {
  border: 'hsl(var(--border))',
  card: 'hsl(var(--card))',
  muted: 'hsl(var(--muted))',
  accent: 'hsl(var(--accent))',
  fg: 'hsl(var(--foreground))',
  mutedFg: 'hsl(var(--muted-foreground))',
};

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear()).slice(2)}.${p(d.getMonth() + 1)}.${p(d.getDate())}`;
};

// 스프레드로 보여줄 배수 (3.0 ~ 7.0, 0.5 단위 — 가로 스와이프)
const SPREAD = [3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5, 7];
const HIGHLIGHT = C.accent; // 권장 구간(배수 minMult~maxMult) 강조색 (무채색)
// 선택 칸 강조 — 연두(라임). 투명도를 높여 뒤 텍스트 가독 유지. 라이트/다크 공통 리터럴.
const SELECT_BORDER = 'rgba(132, 204, 22, 0.55)';
const SELECT_FILL = 'rgba(132, 204, 22, 0.14)';

const recSettings = (rec: PurchaseRecord): PricingSettings => ({ ...DEFAULT_SETTINGS, ...rec.settings });

export default function GardenSalePrice() {
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  // 기록별 배수 선택 상태 — 확정(PATCH) 전까지는 로컬에만 둔다
  const [picks, setPicks] = useState<Record<string, number>>({});
  const [openId, setOpenId] = useState<string | null>(null); // 책정 완료 기록의 '변경' 펼침
  const [busyId, setBusyId] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState('');

  const refresh = async () => {
    const res = await fetch('/api/purchases', { cache: 'no-store' });
    if (res.ok) setPurchases(await res.json());
    setLoaded(true);
  };
  useEffect(() => {
    refresh();
  }, []);

  // 판매가 확정/해제 — 판매가는 서버가 당시 설정 스냅샷 산식으로 다시 계산해 확정한다
  const decide = async (rec: PurchaseRecord, mult: number | null) => {
    if (busyId) return;
    setBusyId(rec.id);
    setError('');
    try {
      const res = await fetch('/api/purchases', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: rec.id, chosenMult: mult }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? '판매가 저장에 실패했어요.');
      setPurchases((prev) => prev.map((r) => (r.id === rec.id ? j : r)));
      setPicks((p) => {
        const { [rec.id]: _, ...rest } = p;
        return rest;
      });
      setOpenId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '판매가 저장에 실패했어요.');
    } finally {
      setBusyId(null);
    }
  };

  // 판매가 공유 링크 생성 → 모바일은 공유시트, 그 외 클립보드 복사 (카톡방 공지용)
  const sharePurchase = async (rec: PurchaseRecord) => {
    if (sharingId) return;
    setSharingId(rec.id);
    try {
      const res = await fetch('/api/garden-share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recordId: rec.id }),
      });
      if (!res.ok) {
        // 실패를 조용히 삼키면 링크가 복사된 줄 알게 된다 — 카드 상단 에러로 알린다
        setError('공유 링크 생성에 실패했어요. 잠시 후 다시 시도해주세요.');
        return;
      }
      const { url } = await res.json();
      const title = `${rec.bean} — 판매가 ${rec.chosenPrice != null ? won(rec.chosenPrice) : ''}`;
      if (navigator.share) {
        await navigator.share({ title, url }).catch(() => {});
      } else {
        await navigator.clipboard.writeText(url);
        setCopiedId(rec.id);
        setTimeout(() => setCopiedId(null), 2000);
      }
    } finally {
      setSharingId(null);
    }
  };

  // 미책정 = 판매가가 아직 없는 발주 기록 — 이 화면의 작업 대기열 (최신 발주부터)
  const unpriced = useMemo(
    () =>
      purchases
        .filter((r) => r.chosenPrice == null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [purchases]
  );

  // 책정 완료 — 원두별 그룹(각 그룹 최신순), 그룹은 최근 기록순 (발주 화면과 같은 배치)
  const pricedGroups = useMemo(() => {
    const m = new Map<string, PurchaseRecord[]>();
    for (const r of purchases) {
      if (r.chosenPrice == null) continue;
      const k = normalize(r.bean);
      const arr = m.get(k) ?? [];
      arr.push(r);
      m.set(k, arr);
    }
    const groups = Array.from(m.values()).map((rs) =>
      rs.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    );
    groups.sort((a, b) => b[0].createdAt.localeCompare(a[0].createdAt));
    return groups;
  }, [purchases]);

  // 카드 우측 상단 공유 대상 — 판매가가 책정된 가장 최근 기록
  const latestPriced = useMemo(
    () =>
      purchases
        .filter((r) => r.chosenPrice != null)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    [purchases]
  );

  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      {error && (
        <p className="text-[13px]" style={{ color: 'hsl(0 72% 45%)', margin: '0 0 16px' }}>
          {error}
        </p>
      )}

      <div className="divide-y divide-border">
      {/* 판매가 미책정 — 발주 담당이 저장한 기록 중 책정 대기 건 */}
      <div className="min-w-0 pb-[54px]">
        <p className="ta-label">판매가 미책정</p>
        {!loaded ? (
          <p className="text-[13px] text-muted-foreground" style={{ margin: 0 }}>불러오는 중…</p>
        ) : unpriced.length === 0 ? (
          <p className="text-[13px] text-muted-foreground" style={{ margin: 0 }}>
            책정을 기다리는 발주 기록이 없어요. 발주가 저장되면 여기에 나타납니다.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {unpriced.map((rec) => (
              <RecordPricer
                key={rec.id}
                rec={rec}
                pick={picks[rec.id] ?? null}
                onPick={(m) => setPicks((p) => ({ ...p, [rec.id]: m }))}
                onDecide={(m) => decide(rec, m)}
                busy={busyId === rec.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* 책정 완료 — 판매가 확인·공유·재책정 */}
      {pricedGroups.length > 0 && (
        <div className="min-w-0 pt-[54px]">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <p className="ta-label">책정 완료</p>
            {latestPriced && (
              <button
                onClick={() => sharePurchase(latestPriced)}
                className="text-muted-foreground hover:text-foreground"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, flexShrink: 0 }}
                title={`최근 책정 판매가 공유 — ${latestPriced.bean} (카톡방 공지용)`}
              >
                {copiedId === latestPriced.id ? '링크 복사됨 ✓' : sharingId === latestPriced.id ? '…' : '공유'}
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {pricedGroups.map((group) => (
              <div key={group[0].id}>
                <p className="text-[13px] text-foreground mb-1.5">
                  {group[0].bean}
                  {group[0].roastery && (
                    <span className="text-[11px] text-muted-foreground"> · {group[0].roastery}</span>
                  )}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {group.map((rec) => (
                    <div key={rec.id}>
                      <div className="gs-row">
                        <span className="gs-meta">
                          <span className="tabular text-muted-foreground" style={{ width: 64, flexShrink: 0 }}>{fmtDate(rec.createdAt)}</span>
                          <span className="tabular text-muted-foreground" style={{ flexShrink: 0 }}>재료비 {won(rec.costPerCup)}</span>
                        </span>
                        <span className="gs-price">
                          <span className="tabular text-foreground">
                            책정 판매가 {won(rec.chosenPrice!)}
                            <span className="text-muted-foreground"> ({Math.round((rec.costPerCup / rec.chosenPrice!) * 100)}%)</span>
                          </span>
                        </span>
                        <button
                          onClick={() => {
                            setOpenId(openId === rec.id ? null : rec.id);
                            setError('');
                          }}
                          className="text-muted-foreground hover:text-foreground"
                          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, flexShrink: 0 }}
                        >
                          {openId === rec.id ? '접기' : '변경'}
                        </button>
                      </div>
                      {openId === rec.id && (
                        <div style={{ marginTop: 8 }}>
                          <RecordPricer
                            rec={rec}
                            pick={picks[rec.id] ?? rec.chosenMult}
                            onPick={(m) => setPicks((p) => ({ ...p, [rec.id]: m }))}
                            onDecide={(m) => decide(rec, m)}
                            onClear={() => decide(rec, null)}
                            busy={busyId === rec.id}
                            compact
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// 발주 기록 1건의 책정 UI — 기록 요약 + 배수 스프레드 표 + 확정 버튼
function RecordPricer({
  rec,
  pick,
  onPick,
  onDecide,
  onClear,
  busy,
  compact,
}: {
  rec: PurchaseRecord;
  pick: number | null;
  onPick: (m: number) => void;
  onDecide: (m: number) => void;
  onClear?: () => void;
  busy: boolean;
  compact?: boolean; // 책정 완료 목록 안 재책정 — 요약줄 생략
}) {
  const s = recSettings(rec);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
      {!compact && (
        <div>
          <p className="text-[13px] text-foreground" style={{ margin: 0 }}>
            {rec.bean}
            {rec.roastery && <span className="text-[11px] text-muted-foreground"> · {rec.roastery}</span>}
          </p>
          <p className="text-[11px] text-muted-foreground tabular" style={{ margin: '2px 0 0' }}>
            {fmtDate(rec.createdAt)}
            {(rec.staffName || rec.createdBy) && ` · ${rec.staffName ? `${rec.staffName}님 발주` : rec.createdBy!.split('@')[0]}`}
            {` · 매입 ${won(rec.purchasePrice)}`}
            {rec.settings?.vatIncluded && 'ㆍVAT포함'}
            {` · 재료비 ${won(rec.costPerCup)}`}
          </p>
        </div>
      )}

      {/* 배수 스프레드 표 (가로 스와이프) — 판매가는 당시 설정 스냅샷 산식으로 계산 */}
      <div className="rounded-md border border-border" style={{ overflowX: 'auto', fontSize: 13, WebkitOverflowScrolling: 'touch', minWidth: 0 }}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `52px repeat(${SPREAD.length}, 76px)`,
            minWidth: 'max-content',
          }}
        >
          <Cell label>배수</Cell>
          {SPREAD.map((m) => (
            <Cell key={`h${m}`} pos="top" hi={m >= s.minMult && m <= s.maxMult} selected={pick === m} onClick={() => onPick(m)}>
              {m.toFixed(1)}×
            </Cell>
          ))}

          <Cell label>판매가</Cell>
          {SPREAD.map((m) => (
            <Cell key={`p${m}`} pos="mid" hi={m >= s.minMult && m <= s.maxMult} selected={pick === m} onClick={() => onPick(m)}>
              {won(priceAtMult(rec.purchasePrice, m, s))}
            </Cell>
          ))}

          <Cell label>원가율</Cell>
          {SPREAD.map((m) => (
            <Cell key={`r${m}`} pos="bottom" hi={m >= s.minMult && m <= s.maxMult} muted selected={pick === m} onClick={() => onPick(m)}>
              {/* 이론값(100/배수)이 아니라 100원 올림 반영 실제 원가율 — 저장 기록·대시보드와 같은 산식 */}
              {Math.round((rec.costPerCup / priceAtMult(rec.purchasePrice, m, s)) * 100)}%
            </Cell>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground" style={{ margin: 0 }}>
        강조 칸 = 권장 구간(배수 {s.minMult}~{s.maxMult}) · 배수를 클릭해 책정 판매가를 고르세요
      </p>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => pick != null && onDecide(pick)}
          disabled={busy || pick == null}
          className="ta-btn-primary"
          style={{ flex: 1 }}
        >
          {busy
            ? '저장 중…'
            : pick != null
              ? `판매가 ${won(priceAtMult(rec.purchasePrice, pick, s))} 확정`
              : '배수를 선택하세요'}
        </button>
        {onClear && (
          <button onClick={onClear} disabled={busy} className="ta-btn" style={{ flexShrink: 0 }}>
            책정 해제
          </button>
        )}
      </div>
    </div>
  );
}

function Cell({
  children,
  label,
  hi,
  muted,
  selected,
  onClick,
  pos,
}: {
  children: React.ReactNode;
  label?: boolean;
  hi?: boolean;
  muted?: boolean;
  selected?: boolean;
  onClick?: () => void;
  pos?: 'top' | 'mid' | 'bottom';
}) {
  const style: React.CSSProperties = {
    padding: '7px 3px',
    textAlign: label ? 'left' : 'center',
    borderTop: `1px solid ${C.border}`,
    borderLeft: label ? 'none' : `1px solid ${C.border}`,
    backgroundColor: label ? C.muted : hi ? HIGHLIGHT : C.card,
    color: muted ? C.mutedFg : label ? C.mutedFg : C.fg,
    fontSize: label || muted ? 11 : 13,
    whiteSpace: 'nowrap',
    cursor: onClick ? 'pointer' : 'default',
  };
  // 라벨 칸은 가로 스크롤 시 좌측 고정
  if (label) {
    style.position = 'sticky';
    style.left = 0;
    style.zIndex = 2;
  }
  if (selected) {
    // 세 칸의 바깥 테두리만 강조(투명 연두) 2px → 한 박스처럼, 모서리 라운드 + 옅은 채움
    const B = `2px solid ${SELECT_BORDER}`;
    style.backgroundColor = SELECT_FILL;
    style.borderLeft = B;
    style.borderRight = B;
    if (pos === 'top') {
      style.borderTop = B;
      style.borderTopLeftRadius = 7;
      style.borderTopRightRadius = 7;
    }
    if (pos === 'bottom') {
      style.borderBottom = B;
      style.borderBottomLeftRadius = 7;
      style.borderBottomRightRadius = 7;
    }
  }
  return (
    <div onClick={onClick} className="tabular" style={style}>
      {children}
    </div>
  );
}
