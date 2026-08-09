'use client';

import { useEffect, useMemo, useState } from 'react';
import type { GardenOptions, PricingSettings, PurchaseRecord } from '@/lib/types';
import { DEFAULT_SETTINGS, computePricing, normalize } from '@/lib/pricing';
import { toast } from '@/components/Toast';
import { fmtDate } from '@/lib/garden/format';

// 인라인 스타일에서 참조할 midday 토큰 (HSL 변수)
const C = {
  border: 'hsl(var(--border))',
  card: 'hsl(var(--card))',
  muted: 'hsl(var(--muted))',
  accent: 'hsl(var(--accent))',
  fg: 'hsl(var(--foreground))',
  mutedFg: 'hsl(var(--muted-foreground))',
  primary: 'hsl(var(--primary))',
};

const won = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

// 발주 전용 화면 — 판매가 책정(배수 선택·공유)은 권한이 분리된 '판매가 설정' 탭
// (GardenSalePrice)이 담당한다. 여기서는 발주 기록 저장과 원가 확인까지만 한다.
export default function GardenService() {
  const [settings, setSettings] = useState<PricingSettings>(DEFAULT_SETTINGS);
  const [bean, setBean] = useState('');
  const [beanEn, setBeanEn] = useState(''); // 영문 원두명 — 원두카드 인쇄용
  const [translating, setTranslating] = useState(false); // 한글 원두명 → 영문 AI 변환 중
  const [tastingNotes, setTastingNotes] = useState(''); // 테이스팅 노트 — 원두카드 인쇄용
  const [roastery, setRoastery] = useState('');
  // 발주 날짜 — 기본 오늘(KST). 로스팅 날짜는 발주 시점엔 모르므로 수령 후 [수령] 버튼으로 기재
  const [orderDate, setOrderDate] = useState(() => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10));
  const [receivingId, setReceivingId] = useState<string | null>(null); // [수령] 클릭한 기록 — 날짜 입력창 노출
  const [staffName, setStaffName] = useState(''); // 발주한 스탭이름 — 기록에 'OOO님'으로 표시
  // 드롭다운 명단(스탭이름·로스팅사) — 설정에서 관리, 새 이름 저장 시 자동 추가
  const [options, setOptions] = useState<GardenOptions>({ staffNames: [], roasteries: [] });
  const [price, setPrice] = useState<number>(0);
  // 원두봉투 스캔 상태 — 인식 결과로 원두명·로스팅사·용량 자동 기입
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState<string | null>(null);
  const [purchases, setPurchases] = useState<PurchaseRecord[]>([]);
  const [purchasesLoaded, setPurchasesLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  // 카톡 발주 알림 — 허용 계정에만 [발주] 버튼 노출, jobs 는 기록별 전송 상태(pending|sent|failed)
  const [kakao, setKakao] = useState<{ allowed: boolean; jobs: Record<string, string> }>({ allowed: false, jobs: {} });
  const [kakaoSending, setKakaoSending] = useState<string | null>(null);
  // 발주 미리보기 카드 — 문구를 고쳐서 보낼 수 있다. 방은 서버 매핑 고정(오전송 방지).
  const [kakaoPreview, setKakaoPreview] = useState<{ recId: string; bean: string; room: string; message: string } | null>(null);

  // 미리보기 모달 Escape 닫기 — 배경 클릭과 같은 동작을 키보드에도 연다
  useEffect(() => {
    if (!kakaoPreview) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setKakaoPreview(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [kakaoPreview]);

  const refreshPurchases = async () => {
    const res = await fetch('/api/purchases', { cache: 'no-store' });
    if (res.ok) setPurchases(await res.json());
    setPurchasesLoaded(true);
  };
  useEffect(() => {
    refreshPurchases();
    fetch('/api/garden-options', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setOptions({ staffNames: j.staffNames ?? [], roasteries: j.roasteries ?? [] }));
    fetch('/api/kakao-notify', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setKakao({ allowed: !!j.allowed, jobs: j.jobs ?? {} }));
  }, []);

  // 잔존율·투입량이 0이면(입력창 비움) 재료비 0원·판매가 0원이 그대로 저장되므로 결과 자체를 막는다
  const result = useMemo(
    () =>
      price > 0 && settings.capacityG > 0 && settings.yieldRate > 0 && settings.doseG > 0
        ? computePricing(price, settings)
        : null,
    [price, settings]
  );

  const setNum = (key: keyof PricingSettings, v: number) =>
    setSettings((s) => ({ ...s, [key]: v }));

  const adjMin = (d: number) =>
    setSettings((s) => ({ ...s, minMult: clamp(s.minMult + d, 3, s.maxMult) }));
  const adjMax = (d: number) =>
    setSettings((s) => ({ ...s, maxMult: clamp(s.maxMult + d, s.minMult, 7) }));

  const savePurchase = async () => {
    if (!result || !bean.trim() || price <= 0 || saving) return;
    setSaving(true);
    await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bean: bean.trim(),
        beanEn: beanEn.trim() || undefined,
        tastingNotes: tastingNotes.trim() || undefined,
        roastery: roastery.trim() || undefined,
        orderDate: orderDate || undefined,
        staffName: staffName.trim() || undefined,
        purchasePrice: price,
        settings,
        costPerCup: result.costPerCup,
        rangeLow: result.rangeLow,
        rangeHigh: result.rangeHigh,
      }),
    });
    // 직접 입력한 새 스탭이름·로스팅사는 드롭다운 명단에 자동 추가 (설정에서 관리)
    const s = staffName.trim();
    const r = roastery.trim();
    const newStaff = s && !options.staffNames.includes(s);
    const newRoastery = r && !options.roasteries.includes(r);
    if (newStaff || newRoastery) {
      const next: GardenOptions = {
        staffNames: newStaff ? [s, ...options.staffNames] : options.staffNames,
        roasteries: newRoastery ? [r, ...options.roasteries] : options.roasteries,
      };
      setOptions(next);
      await fetch('/api/garden-options', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
    }
    await refreshPurchases();
    setSaving(false);
  };

  const deletePurchase = async (id: string) => {
    await fetch('/api/purchases', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    refreshPurchases();
  };

  // [발주] 1단계 — 서버가 만든 전송 문구를 미리보기 카드로 연다. 담당자가 문구를 고칠 수 있다.
  const openKakaoPreview = async (rec: PurchaseRecord) => {
    if (kakaoSending) return;
    setKakaoSending(rec.id);
    try {
      const pv = await fetch(`/api/kakao-notify?purchaseId=${encodeURIComponent(rec.id)}`, { cache: 'no-store' });
      const pj = await pv.json().catch(() => null);
      if (!pv.ok || !pj?.message) {
        toast(pj?.error ?? '미리보기를 불러오지 못했습니다.', 'error');
        return;
      }
      setKakaoPreview({ recId: rec.id, bean: rec.bean, room: pj.room, message: pj.message });
    } finally {
      setKakaoSending(null);
    }
  };

  // [발주] 2단계 — 미리보기 카드에서 [전송] 확정. 고친 문구가 그대로 잡에 실린다.
  const confirmKakaoSend = async () => {
    if (!kakaoPreview || kakaoSending) return;
    if (!kakaoPreview.message.trim()) {
      toast('빈 메시지는 보낼 수 없습니다.', 'error');
      return;
    }
    setKakaoSending(kakaoPreview.recId);
    try {
      const res = await fetch('/api/kakao-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchaseId: kakaoPreview.recId, message: kakaoPreview.message.trim() }),
      });
      const j = await res.json().catch(() => null);
      if (res.ok && j?.job) {
        setKakao((k) => ({ ...k, jobs: { ...k.jobs, [kakaoPreview.recId]: j.job.status } }));
        setKakaoPreview(null);
      } else if (j?.error) {
        toast(j.error, 'error');
      }
    } finally {
      setKakaoSending(null);
    }
  };

  // [수령] — 택배 도착 후 봉투에 찍힌 로스팅 날짜를 기재한다 (발주 시점엔 알 수 없는 값)
  const receiveBean = async (rec: PurchaseRecord, date: string) => {
    if (!date) return;
    const res = await fetch('/api/purchases/receive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: rec.id, roastDate: date }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      toast(j?.error ?? '수령 기재에 실패했습니다.', 'error');
    }
    setReceivingId(null);
    refreshPurchases();
  };

  // 버튼 라벨 — 대기(전송기가 아직 안 집어감)와 완료를 구분해 보여준다
  const kakaoLabel = (status: string | undefined, sending: boolean) => {
    if (sending) return '…';
    if (status === 'pending') return '대기중';
    if (status === 'sent') return '발주됨 ✓';
    if (status === 'failed') return '실패·재시도';
    return '발주';
  };

  // 발주 기록 — 원두별 그룹(각 그룹 최신순), 그룹은 최근 기록순
  const purchaseGroups = useMemo(() => {
    const m = new Map<string, PurchaseRecord[]>();
    for (const r of purchases) {
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

  return (
    <div style={{ width: '100%', minWidth: 0 }}>
      <div className="divide-y divide-border">
        <div className="min-w-0 pb-[54px]">
          <p className="ta-label">판매가 산식 기준</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px 12px' }}>
            <Field label="구매 용량(g)" value={settings.capacityG} onChange={(v) => setNum('capacityG', v)} />
            {/* 값은 '남는 비율'(잔존율) — 로스율 10%면 90을 입력한다. 라벨 오독으로 10을 넣으면 재료비가 9배가 된다 */}
            <Field label="로스 제외 잔존율(%)" value={Math.round(settings.yieldRate * 100)} onChange={(v) => setNum('yieldRate', v / 100)} />
            <Field label="추출 투입량(g)" value={settings.doseG} onChange={(v) => setNum('doseG', v)} />
          </div>
        </div>

        <div className="min-w-0 py-[54px]">
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <p className="ta-label">원두 정보 입력</p>
            {/* 원두봉투 촬영 → AI 인식으로 원두명·로스팅사·용량 자동 기입 (영수증 인식과 동일 패턴) */}
            <label className="ta-btn" style={{ height: 30, paddingLeft: 10, paddingRight: 10, fontSize: 13, cursor: 'pointer' }}>
              {scanning ? '인식 중…' : '📷 원두봉투 스캔'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                disabled={scanning}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (!file) return;
                  setScanning(true);
                  setScanMsg(null);
                  try {
                    const fd = new FormData();
                    fd.append('file', file);
                    const res = await fetch('/api/garden-bean-scan', { method: 'POST', body: fd });
                    const j = await res.json();
                    if (!res.ok) throw new Error(j.error ?? '인식에 실패했어요.');
                    const x = j.extraction as {
                      beanName: string | null;
                      roastery: string | null;
                      weightG: number | null;
                      roastLevel: string | null;
                      tastingNotes: string | null;
                    };
                    // 영문 위주 이름이면 영문 원두명으로, 아니면 한글 원두명으로 기입
                    if (x.beanName) {
                      if (/^[\x00-\x7F]*$/.test(x.beanName)) setBeanEn(x.beanName);
                      else setBean(x.beanName);
                    }
                    if (x.tastingNotes) setTastingNotes(x.tastingNotes);
                    if (x.roastery) setRoastery(x.roastery);
                    if (x.weightG) setSettings((s) => ({ ...s, capacityG: x.weightG! }));
                    const got = [
                      x.beanName && `원두명`,
                      x.roastery && `로스팅사`,
                      x.weightG && `용량 ${x.weightG}g`,
                      x.roastLevel && `배전도 ${x.roastLevel}`,
                      x.tastingNotes && `노트: ${x.tastingNotes}`,
                    ].filter(Boolean);
                    setScanMsg(
                      got.length
                        ? `✓ 인식 완료 — ${got.join(' · ')}. 공급가만 입력하면 돼요.`
                        : '⚠ 봉투에서 정보를 읽지 못했어요. 라벨이 잘 보이게 다시 찍어주세요.'
                    );
                  } catch (err) {
                    setScanMsg(`⚠ ${(err as Error).message}`);
                  } finally {
                    setScanning(false);
                  }
                }}
              />
            </label>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {scanMsg && (
              <p className="text-[13px] text-muted-foreground" style={{ margin: 0 }}>{scanMsg}</p>
            )}
            <input
              value={bean}
              onChange={(e) => setBean(e.target.value)}
              placeholder="원두명 (예: 에티오피아 게뎁)"
              className="ta-input w-full"
            />
            <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
              <input
                value={beanEn}
                onChange={(e) => setBeanEn(e.target.value)}
                placeholder="영문 원두명 (예: Ethiopia Gedeb) — 원두카드용"
                className="ta-input"
                style={{ flex: 1, minWidth: 0 }}
              />
              {/* 한글 원두명 → 영문 표기 AI 변환 */}
              <button
                onClick={async () => {
                  if (translating || !bean.trim()) return;
                  setTranslating(true);
                  setScanMsg(null);
                  try {
                    const res = await fetch('/api/garden-bean-translate', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ bean: bean.trim() }),
                    });
                    const j = await res.json();
                    if (!res.ok) throw new Error(j.error ?? '영문 변환에 실패했어요.');
                    setBeanEn(j.beanEn);
                  } catch (err) {
                    setScanMsg(`⚠ ${(err as Error).message}`);
                  } finally {
                    setTranslating(false);
                  }
                }}
                disabled={translating || !bean.trim()}
                className="ta-btn"
                style={{ height: 'auto', paddingLeft: 10, paddingRight: 10, fontSize: 13, flexShrink: 0 }}
                title="한글 원두명을 업계 표준 영문 표기로 자동 변환"
              >
                {translating ? '변환 중…' : '영문 자동'}
              </button>
            </div>
            <input
              value={tastingNotes}
              onChange={(e) => setTastingNotes(e.target.value)}
              placeholder="테이스팅 노트 (예: 말린 무화과, 오렌지, 아카시아, 꿀) — 원두카드용"
              className="ta-input w-full"
            />
            <PickOrType
              value={roastery}
              onChange={setRoastery}
              list={options.roasteries}
              selectPlaceholder="로스팅사 선택"
              inputPlaceholder="로스팅사 (예: 언스페셜티)"
            />
            <PickOrType
              value={staffName}
              onChange={setStaffName}
              list={options.staffNames}
              selectPlaceholder="스탭이름 선택"
              inputPlaceholder="스탭이름 (예: 홍길동)"
              optionLabel={(n) => `${n}님`}
            />
            {/* 로스팅 날짜는 봉투에 찍혀 와서 발주 시점엔 모른다 — 수령 후 발주 리스트의 [수령]으로 기재 */}
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span className="text-[11px] text-muted-foreground" style={{ flexShrink: 0 }}>발주 날짜</span>
              <input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="ta-input tabular"
                style={{ flex: 1, minWidth: 0 }}
              />
            </label>
            {/* 구매 용량 — 500g/1000g 프리셋 + 직접 입력 (잔당 재료비 계산 기준) */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span className="text-[11px] text-muted-foreground" style={{ flexShrink: 0 }}>구매 용량</span>
              <div className="inline-flex gap-1 rounded-md border border-border p-1" style={{ flexShrink: 0 }}>
                {[500, 1000].map((g) => {
                  const on = settings.capacityG === g;
                  return (
                    <button
                      key={g}
                      onClick={() => setNum('capacityG', g)}
                      className={`rounded-sm px-2.5 py-1 text-[13px] transition-colors ${
                        on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {g}g
                    </button>
                  );
                })}
              </div>
              <input
                type="number"
                value={settings.capacityG || ''}
                onChange={(e) => setNum('capacityG', Number(e.target.value) || 0)}
                placeholder="직접 입력"
                className="ta-input tabular"
                style={{ flex: 1, minWidth: 0 }}
              />
              <span className="text-[11px] text-muted-foreground" style={{ flexShrink: 0 }}>g</span>
            </div>
            <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
              <input
                type="text"
                inputMode="numeric"
                value={price ? price.toLocaleString('ko-KR') : ''}
                onChange={(e) => setPrice(Number(e.target.value.replace(/[^\d]/g, '')) || 0)}
                placeholder={`공급가 000,000 (${settings.capacityG}g·부가세 ${settings.vatIncluded ? '포함' : '별도'})`}
                className="ta-input tabular"
                style={{ flex: 1, minWidth: 0 }}
              />
              {/* 로스터리별 공급가 안내 방식(부가세 포함/별도)에 맞춰 선택 */}
              <div className="inline-flex gap-1 rounded-md border border-border p-1" style={{ flexShrink: 0, alignSelf: 'center' }}>
                {([false, true] as boolean[]).map((v) => {
                  const on = !!settings.vatIncluded === v;
                  return (
                    <button
                      key={String(v)}
                      onClick={() => setSettings((s) => ({ ...s, vatIncluded: v }))}
                      className={`rounded-sm px-2.5 py-1 text-[13px] transition-colors ${
                        on ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                      title={v ? '입력한 공급가를 부가세 포함가로 계산' : '입력한 공급가에 부가세 10%를 더해 계산'}
                    >
                      {v ? 'VAT 포함' : 'VAT 별도'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {result && (
            <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', gap: 28, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span className="text-[11px] text-muted-foreground">잔당 재료비 (VAT 포함)</span>
                  <span className="text-[22px] text-foreground tabular">{won(result.costPerCup)}</span>
                </div>
                <div className="text-[11px] text-muted-foreground" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span>권장</span>
                  <Stepper value={settings.minMult} onDec={() => adjMin(-0.5)} onInc={() => adjMin(0.5)} />
                  <span>~</span>
                  <Stepper value={settings.maxMult} onDec={() => adjMax(-0.5)} onInc={() => adjMax(0.5)} />
                </div>
              </div>

              {/* 권장 판매 범위 — 배수 선택(책정)은 '판매가 설정' 탭 담당이라 여기선 범위만 보여준다 */}
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span className="text-[11px] text-muted-foreground">권장 판매 범위</span>
                <span className="text-[15px] text-foreground tabular">
                  {won(result.rangeLow)} ~ {won(result.rangeHigh)}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                저장하면 발주 기록으로 남고, 판매가 책정은 &lsquo;판매가 설정&rsquo; 탭에서 담당자가 진행해요
              </p>

              <button
                onClick={savePurchase}
                disabled={saving}
                className="ta-btn-primary w-full mt-1"
              >
                {saving ? '저장 중…' : `${bean.trim() ? bean.trim() + ' ' : ''}원두 저장하기`}
              </button>
            </div>
          )}
        </div>

        {/* 발주 기록 — 같은 원두 재발주 시 원가·판매가 비교 */}
        {!purchasesLoaded && (
          <div className="min-w-0 pt-[54px]">
            <p className="ta-label">이전 발주 리스트</p>
            <p className="text-[13px] text-muted-foreground" style={{ margin: 0 }}>불러오는 중…</p>
          </div>
        )}
        {purchasesLoaded && purchases.length > 0 && (
          <div className="min-w-0 pt-[54px]">
            <p className="ta-label">이전 발주 리스트</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
              {purchaseGroups.map((group) => (
                <div key={group[0].id}>
                  <p className="text-[13px] text-foreground mb-3">
                    {group[0].bean}
                    {group[0].roastery && (
                      <span className="text-[11px] text-muted-foreground"> · {group[0].roastery}</span>
                    )}
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {group.map((rec, i) => {
                      const older = group[i + 1];
                      const delta = older ? rec.costPerCup - older.costPerCup : 0;
                      return (
                        <div key={rec.id} className="gs-row">
                          <span className="gs-meta">
                            <span className="tabular text-muted-foreground" style={{ width: 64, flexShrink: 0 }}>{fmtDate(rec.orderDate ?? rec.createdAt)}</span>
                            {/* 스탭이름이 있으면 'OOO님' 우선, 없으면 저장 계정(구 기록) */}
                            {(rec.staffName || rec.createdBy) && (
                              <span className="text-muted-foreground" style={{ flexShrink: 0 }}>
                                {rec.staffName ? `${rec.staffName}님` : rec.createdBy!.split('@')[0]}
                              </span>
                            )}
                            {/* 로스팅 날짜: 있으면 표시, 없으면 [수령] — 클릭 시 날짜 입력으로 바뀜 */}
                            {rec.roastDate ? (
                              <span className="tabular text-muted-foreground" style={{ flexShrink: 0 }}>로스팅 {fmtDate(rec.roastDate)}</span>
                            ) : receivingId === rec.id ? (
                              <input
                                type="date"
                                autoFocus
                                onChange={(e) => e.target.value && receiveBean(rec, e.target.value)}
                                onBlur={() => setReceivingId(null)}
                                className="ta-input tabular"
                                style={{ height: 22, fontSize: 11, padding: '0 4px', flexShrink: 0, width: 130 }}
                              />
                            ) : (
                              <button
                                onClick={() => setReceivingId(rec.id)}
                                className="text-foreground"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, flexShrink: 0, padding: 0, textDecoration: 'underline' }}
                                title="수령 완료 — 봉투의 로스팅 날짜 기재"
                              >
                                수령
                              </button>
                            )}
                            <span className="tabular text-muted-foreground" style={{ flexShrink: 0 }}>
                              원가 {won(rec.purchasePrice)}
                              {/* VAT 포함가로 입력한 기록만 표시 — 무표시 = 별도(구 기록 포함) */}
                              {rec.settings?.vatIncluded && <span style={{ fontSize: 11 }}>·VAT포함</span>}
                            </span>
                            <span className="tabular text-foreground" style={{ flexShrink: 0 }}>
                              재료비 {won(rec.costPerCup)}
                              {older && delta !== 0 && (
                                <span className="tabular text-foreground" style={{ marginLeft: 4 }}>
                                  {delta > 0 ? '▲' : '▼'}{won(Math.abs(delta))}
                                </span>
                              )}
                            </span>
                          </span>
                          <span className="gs-price">
                            {rec.chosenPrice != null && rec.chosenPrice > 0 ? (
                              <span className="tabular text-foreground">
                                책정 판매가 {won(rec.chosenPrice)}
                                <span className="text-muted-foreground"> ({Math.round((rec.costPerCup / rec.chosenPrice) * 100)}%)</span>
                              </span>
                            ) : (
                              <span className="tabular text-muted-foreground">판매 {won(rec.rangeLow)}~{won(rec.rangeHigh)}</span>
                            )}
                          </span>
                          {kakao.allowed && (
                            <button
                              onClick={() => openKakaoPreview(rec)}
                              // pending·sent 는 서버가 중복 등록을 막지만, 눌러도 변화가 없어 혼란만 주므로 비활성화
                              disabled={kakaoSending === rec.id || kakao.jobs[rec.id] === 'pending' || kakao.jobs[rec.id] === 'sent'}
                              className={kakao.jobs[rec.id] === 'sent' ? 'text-muted-foreground' : 'text-foreground hover:text-foreground'}
                              style={{ background: 'none', border: 'none', cursor: kakao.jobs[rec.id] === 'sent' ? 'default' : 'pointer', fontSize: 11, flexShrink: 0, padding: 0 }}
                              title="카톡방에 발주 메시지 전송"
                            >
                              {kakaoLabel(kakao.jobs[rec.id], kakaoSending === rec.id)}
                            </button>
                          )}
                          <a
                            href={`/garden/beancard?recordId=${rec.id}`}
                            className="text-muted-foreground hover:text-foreground"
                            style={{ fontSize: 11, flexShrink: 0, textDecoration: 'none' }}
                            title="원두카드 인쇄 (A4 3×3)"
                          >
                            카드
                          </a>
                          <button
                            onClick={() => deletePurchase(rec.id)}
                            className="gs-del text-muted-foreground hover:text-foreground"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 6, margin: -6 }}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

        {/* 발주 카톡 미리보기 카드 — 문구를 고쳐서 전송할 수 있다. 대상 방은 서버 매핑 고정 */}
        {kakaoPreview && (
          <div
            onClick={() => setKakaoPreview(null)}
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
                <p className="text-[13px] text-muted-foreground" style={{ margin: '4px 0 0' }}>
                  <span className="text-foreground">[{kakaoPreview.room}]</span> 방으로 전송됩니다 — 문구는 자유롭게 고칠 수 있어요
                </p>
              </div>
              <textarea
                autoFocus
                value={kakaoPreview.message}
                onChange={(e) => setKakaoPreview((p) => (p ? { ...p, message: e.target.value } : p))}
                rows={7}
                className="ta-input"
                style={{ width: '100%', minWidth: 0, height: 'auto', padding: 10, fontSize: 13, lineHeight: 1.6, resize: 'vertical', fontFamily: 'inherit' }}
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => setKakaoPreview(null)} className="ta-btn" style={{ height: 34, paddingLeft: 14, paddingRight: 14 }}>
                  취소
                </button>
                <button
                  onClick={confirmKakaoSend}
                  disabled={kakaoSending != null || !kakaoPreview.message.trim()}
                  className="ta-btn-primary"
                  style={{ height: 34, paddingLeft: 14, paddingRight: 14 }}
                >
                  {kakaoSending ? '전송 중…' : '전송'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

// 드롭다운 선택 + '＋ 직접 입력' 폴백 — 명단은 설정(/garden/settings)에서 관리.
// 명단에 없는 값(원두봉투 스캔 결과 등)이 들어오면 자동으로 입력 모드로 전환된다.
function PickOrType({
  value,
  onChange,
  list,
  selectPlaceholder,
  inputPlaceholder,
  optionLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  list: string[];
  selectPlaceholder: string;
  inputPlaceholder: string;
  optionLabel?: (v: string) => string;
}) {
  const [custom, setCustom] = useState(false);
  // 직접 입력한 값이 명단에 추가되면(저장 후) 드롭다운 모드로 복귀
  useEffect(() => {
    if (custom && value && list.includes(value)) setCustom(false);
  }, [custom, value, list]);

  // 명단이 비어 있어도 드롭다운은 항상 노출 — '＋ 직접 입력'으로 새 항목을 넣는다
  const showSelect = !custom && (value === '' || list.includes(value));
  if (showSelect) {
    return (
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === '__custom') {
            setCustom(true);
            onChange('');
          } else {
            onChange(e.target.value);
          }
        }}
        className="ta-input w-full"
      >
        <option value="">{selectPlaceholder}</option>
        {list.map((n) => (
          <option key={n} value={n}>{optionLabel ? optionLabel(n) : n}</option>
        ))}
        <option value="__custom">＋ 직접 입력</option>
      </select>
    );
  }
  return (
    <div style={{ display: 'flex', gap: 8, minWidth: 0 }}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={inputPlaceholder}
        className="ta-input"
        style={{ flex: 1, minWidth: 0 }}
      />
      <button
        onClick={() => {
          setCustom(false);
          onChange('');
        }}
        className="ta-btn"
        style={{ height: 'auto', paddingLeft: 10, paddingRight: 10, fontSize: 13, flexShrink: 0 }}
      >
        목록에서 선택
      </button>
    </div>
  );
}

// 권장 구간 하한/상한 조절 화살표 토글
function Stepper({ value, onDec, onInc }: { value: number; onDec: () => void; onInc: () => void }) {
  const btn: React.CSSProperties = {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: C.mutedFg,
    fontSize: 13,
    lineHeight: 1,
    padding: '2px 6px',
    fontFamily: 'inherit',
  };
  return (
    <span className="rounded-md border border-border" style={{ display: 'inline-flex', alignItems: 'center' }}>
      <button onClick={onDec} style={btn}>‹</button>
      <span className="tabular text-foreground" style={{ minWidth: 28, textAlign: 'center', fontSize: 13 }}>{value.toFixed(1)}</span>
      <button onClick={onInc} style={btn}>›</button>
    </span>
  );
}

function Field({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
      <span className="text-[11px] text-muted-foreground">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="ta-input w-full tabular"
      />
    </label>
  );
}
