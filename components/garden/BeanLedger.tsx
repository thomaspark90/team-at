'use client';

import { useEffect, useState } from 'react';
import GardenDashboard from '@/components/garden/GardenDashboard';
import GardenService from '@/components/garden/GardenService';
import { fetchMyAccess } from '@/lib/access/tab-access-client';
import { toast } from '@/components/Toast';

// 원두 장부 — '필터 원두 발주'·'판매가 설정'·'필터 레시피'를 한 화면으로 합친 것 (2026-11-24 대표 결정).
// 원두 목록은 레시피 장부(GardenDashboard › RecipeLedger) 하나만 두고,
//  · 새 발주 입력은 [새 원두 발주] 버튼으로 여는 가운데 창(발주 화면의 입력 폼 — GardenService embedded)
//  · 판매가 책정·변경·공유는 장부 줄 펼침의 '판매가'(LedgerPricing)
//  · 발주 건별 작업(수령·카톡 발주·원두카드·삭제)은 장부 줄 펼침의 '발주 기록'(LedgerOrders)
// 으로 옮겼다. 권한은 그대로 — 버튼·패널은 발주(pricing) 탭 권한이 있는 계정에만 보인다.
export default function BeanLedger({
  initialOrderOpen = false,
  receiveId = null,
}: {
  initialOrderOpen?: boolean; // /garden/pricing 에서 넘어오면(?order=1) 입력 창을 연 채로 시작
  receiveId?: string | null; // 홈의 수령 카드에서 넘어오면(?receive=<id>) 그 발주의 수령 창을 바로 연다
}) {
  const [canOrder, setCanOrder] = useState(false);
  const [open, setOpen] = useState(initialOrderOpen);
  const [reloadKey, setReloadKey] = useState(0);
  useEffect(() => {
    fetchMyAccess().then((a) => setCanOrder(a.mine == null || a.mine.includes('pricing')));
  }, []);

  // 창이 떠 있는 동안 Esc 로 닫기 · 뒤 화면 스크롤 잠금
  useEffect(() => {
    if (!open || !canOrder) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, canOrder]);

  return (
    <div className="min-w-0">
      {/* 새 원두 발주 — 수령 창·발주 미리보기 창과 같은 가운데 창. 바깥을 눌러도 닫히지 않는다(입력 내용 보호) */}
      {open && canOrder && (
        <div role="dialog" aria-modal="true" aria-label="새 원두 발주" className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
          <div className="ta-card bg-background max-h-[92vh] w-full overflow-y-auto rounded-t-2xl sm:max-w-[640px] sm:rounded-md">
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 28 }}>
              <h2 className="text-title text-foreground" style={{ margin: 0 }}>
                새 원두 발주
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-body text-muted-foreground hover:text-foreground"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                닫기
              </button>
            </div>
            <GardenService
              embedded
              onSaved={(bean) => {
                setOpen(false);
                setReloadKey((k) => k + 1);
                toast(`${bean} 발주를 저장했어요. 목록 맨 위에서 확인하세요.`);
              }}
            />
          </div>
        </div>
      )}
      <GardenDashboard
        section="recipes"
        reloadKey={reloadKey}
        receiveId={receiveId}
        toolbar={
          canOrder ? (
            <button onClick={() => setOpen(true)} className="ta-btn-primary" style={{ height: 36, paddingLeft: 16, paddingRight: 16 }}>
              새 원두 발주
            </button>
          ) : null
        }
      />
    </div>
  );
}
