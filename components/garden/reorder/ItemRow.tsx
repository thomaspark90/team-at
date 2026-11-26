'use client';

import { formatSpec } from '@/lib/reorder/spec';
import { SELLER_STATUS_LABEL, type ReorderItem, type SellerStatus } from '@/lib/reorder/types';
import ItemEditor from './ItemEditor';
import { shortDate, won } from './format';

// 품목 한 줄 — 이름·규격·지난 구매, 펼치면 판매처 승인과 수정.

const STATUSES: SellerStatus[] = ['trusted', 'pending', 'excluded'];
const STATUS_SHORT: Record<SellerStatus, string> = { trusted: '승인', pending: '확인 필요', excluded: '제외' };

export default function ItemRow({
  item,
  open,
  editing,
  onToggle,
  onEdit,
  onPatch,
  onSeller,
}: {
  item: ReorderItem;
  open: boolean;
  editing: boolean;
  onToggle: () => void;
  onEdit: (on: boolean) => void;
  onPatch: (body: Record<string, unknown>) => Promise<boolean>;
  onSeller: (seller: string, body: Record<string, unknown>) => Promise<boolean>;
}) {
  const pending = item.sellers.filter((s) => s.status === 'pending').length;
  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button type="button" className="min-w-[14rem] flex-1 text-left" aria-expanded={open} onClick={onToggle}>
          <p className="text-body">
            {item.name}
            <span className="ml-2 text-caption text-muted-foreground">{formatSpec(item.spec)}</span>
            {pending > 0 && <span className="ml-2 text-caption text-amber-600">판매처 확인 {pending}</span>}
          </p>
          <p className="text-caption text-muted-foreground">
            {item.stat
              ? `지난 구매 ${shortDate(item.stat.lastDate)} ${won(item.stat.lastAmount)} · ${item.stat.lastSeller} · 12개월 ${item.stat.count}회 ${won(item.stat.sum)}`
              : '결제 기록 없음'}
          </p>
        </button>
        <label className="flex min-h-9 items-center gap-2 text-body">
          <input type="checkbox" checked={item.compare} onChange={(e) => onPatch({ compare: e.target.checked })} />
          최저가 비교
        </label>
      </div>
      {open && (
        <div className="mt-3 pl-1">
          <p className="text-caption text-muted-foreground">판매처</p>
          <ul className="mt-1 space-y-2">
            {item.sellers.map((s) => (
              <li key={s.name} className="flex flex-wrap items-center gap-x-4 gap-y-1">
                <div className="min-w-[10rem] flex-1">
                  <p className="text-body">{s.name}</p>
                  <p className="text-caption text-muted-foreground">
                    {s.lastDate && s.lastAmount != null ? `${s.count}회 · 최근 ${shortDate(s.lastDate)} ${won(s.lastAmount)}` : '구매 기록 없음'}
                    {' · '}
                    {s.shippingFee == null ? '배송비 미확인' : `배송비 ${won(s.shippingFee)}`}
                  </p>
                </div>
                <div className="flex gap-1" role="group" aria-label={`${s.name} 상태`}>
                  {STATUSES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      title={SELLER_STATUS_LABEL[st]}
                      aria-pressed={s.status === st}
                      className={`ta-btn ${s.status === st ? 'font-medium text-foreground' : 'text-muted-foreground'}`}
                      onClick={() => s.status !== st && onSeller(s.name, { status: st })}
                    >
                      {STATUS_SHORT[st]}
                    </button>
                  ))}
                </div>
              </li>
            ))}
            {item.sellers.length === 0 && <li className="text-body text-muted-foreground">판매처 기록이 없습니다.</li>}
          </ul>
          {editing ? (
            <ItemEditor
              item={item}
              onCancel={() => onEdit(false)}
              onSave={async (body) => {
                const ok = await onPatch(body);
                if (ok) onEdit(false);
                return ok;
              }}
              onDelete={() => onPatch({ deleted: true })}
              onUnlink={(name) => onPatch({ removeMatchName: name })}
            />
          ) : (
            <button type="button" className="ta-btn mt-3" onClick={() => onEdit(true)}>
              품목 수정
            </button>
          )}
        </div>
      )}
    </li>
  );
}
