'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface ManagedCat {
  id: number;
  type: string;
  name: string;
  parent_id: number | null;
  active: boolean;
  pinned: boolean;
  sort: number;
  vat_taxable: boolean;
}

// 과세/면세 토글을 노출할 타입 (손익에서 순액 대상이 되는 매출·비용)
const VAT_TYPES = ['revenue', 'cogs', 'sga'];

// 이름으로 동작을 판별하는 시스템 계정 — 이름 변경·삭제 금지(카드/영수증/분할/대체 정산 로직이 깨진다)
const SYSTEM_NAMES = ['카드대금정산', '영수증분해', '건별분할', '쿠팡대체', '네이버페이대체'];
const isSystem = (name: string) => SYSTEM_NAMES.includes(name);

const TYPE_LABEL: Record<string, string> = {
  revenue: '매출',
  cogs: '재료비(원가)',
  sga: '판매관리비',
  non_operating: '영업외',
  excluded: '손익 제외',
};
const GROUPS = [
  { title: '📥 입금 (들어오는 돈)', hint: '매출과 영업외수익', types: ['revenue', 'non_operating'] },
  { title: '📤 출금 (나가는 돈)', hint: '재료비·판매관리비·자본적지출 등', types: ['cogs', 'sga', 'excluded'] },
];

export default function CategoryManager({ initial }: { initial: ManagedCat[] }) {
  const [cats, setCats] = useState<ManagedCat[]>(initial);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);
  // 이름 변경(2026-08-17 대표 요청) — 거래는 category_id로 연결되어 있어 이름을 바꾸면
  // 이전에 분류한 거래·손익·리포트 전부 새 이름으로 자동 반영된다(소급 수정 불필요).
  const [editId, setEditId] = useState<number | null>(null);
  const [editVal, setEditVal] = useState('');

  const label = (c: ManagedCat) => {
    const p = cats.find((x) => x.id === c.parent_id);
    return p ? `${p.name} › ${c.name}` : c.name;
  };

  async function patch(id: number, change: Partial<ManagedCat>) {
    setBusy(id);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.schema('finance').from('categories').update(change).eq('id', id);
    if (error) setError(error.message);
    else setCats((list) => list.map((c) => (c.id === id ? { ...c, ...change } : c)));
    setBusy(null);
  }

  async function rename(c: ManagedCat) {
    const name = editVal.trim();
    if (!name || name === c.name) {
      setEditId(null);
      return;
    }
    // '미상' 파킹은 이름 포함으로 감지(ClassifyPanel·pnl) — 미상이 빠지는 이름이면 기능이 꺼짐을 경고
    if (c.name.includes('미상') && !name.includes('미상')) {
      const ok = window.confirm(
        `'${c.name}' → '${name}' — 새 이름에 '미상'이 없으면 용도 불명 보류(미상 버튼·미상 모아보기) 기능이 이 계정과 연결이 끊겨요.\n계속할까요?`
      );
      if (!ok) return;
    }
    await patch(c.id, { name });
    setEditId(null);
  }

  async function remove(id: number) {
    if (!window.confirm('이 계정과목을 삭제할까요? (이 항목으로 분류된 거래가 있으면 삭제되지 않아요 — 그럴 땐 비활성만 하세요)')) return;
    setBusy(id);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.schema('finance').from('categories').delete().eq('id', id);
    if (error) setError('삭제 실패: 이 항목으로 분류된 거래가 있어요. 대신 "활성"을 꺼서 숨기세요.');
    else setCats((list) => list.filter((c) => c.id !== id));
    setBusy(null);
  }

  async function add(type: string) {
    const name = (newName[type] || '').trim();
    if (!name) return;
    setAdding(type);
    setError(null);
    const supabase = createClient();
    const maxSort = Math.max(0, ...cats.filter((c) => c.type === type).map((c) => c.sort));
    const { data, error } = await supabase
      .schema('finance')
      .from('categories')
      .insert({ type, name, sort: maxSort + 10 })
      .select('id,type,name,parent_id,active,pinned,sort,vat_taxable')
      .single();
    if (error) setError(error.message);
    else if (data) {
      setCats((list) => [...list, data as ManagedCat]);
      setNewName((m) => ({ ...m, [type]: '' }));
    }
    setAdding(null);
  }

  // 드래그로 같은 타입 내 순서 재배열 → sort 재할당 + DB 저장
  async function reorder(type: string, targetId: number) {
    const dragging = dragId;
    setDragId(null);
    setOverId(null);
    if (dragging == null || dragging === targetId) return;
    const list = cats.filter((c) => c.type === type).sort((a, b) => a.sort - b.sort);
    const from = list.findIndex((c) => c.id === dragging);
    const to = list.findIndex((c) => c.id === targetId);
    if (from < 0 || to < 0) return; // 다른 타입으로 드롭 시 무시

    const arr = [...list];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    const updates = arr.map((c, i) => ({ id: c.id, sort: (i + 1) * 10 }));
    setCats((prev) =>
      prev.map((c) => {
        const u = updates.find((x) => x.id === c.id);
        return u ? { ...c, sort: u.sort } : c;
      })
    );
    const supabase = createClient();
    const results = await Promise.all(
      updates.map((u) => supabase.schema('finance').from('categories').update({ sort: u.sort }).eq('id', u.id))
    );
    const failed = results.find((r) => r.error);
    if (failed?.error) setError(`순서 저장 실패: ${failed.error.message}`);
  }

  return (
    <div className="flex flex-col gap-14">
      <p className="text-[13px] text-muted-foreground">
        왼쪽 <b>손잡이(⠿)를 드래그</b>해 순서를 바꿔요. <b>이름을 클릭</b>하면 ⭐즐겨찾기로 지정돼 분류 드롭다운 맨 위 &ldquo;자주 쓰는&rdquo;에 떠요. <b>이름 변경</b>으로 계정 이름을 바꾸면 이전에 분류해둔 거래·손익에도 새 이름이 그대로 반영돼요. <b>활성</b>을 끄면 숨겨져요. <b>과세/면세</b>는 손익 계산 기준 — 과세 항목은 대시보드에서 공급가액(÷1.1)으로 순액 처리돼요(인건비·이자·수도·세금 등 면세는 그대로).
      </p>
      {error && <div className="text-[13px] text-destructive">⚠️ {error}</div>}

      {GROUPS.map((group) => (
        <div key={group.title} className="flex flex-col gap-8">
          <div>
            <h2 className="text-[15px] tracking-[-0.3px] text-foreground">{group.title}</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{group.hint}</p>
          </div>

          {group.types.map((type) => {
            const list = cats.filter((c) => c.type === type).sort((a, b) => a.sort - b.sort);
            return (
              <div key={type}>
                <h3 className="mb-2 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{TYPE_LABEL[type]}</h3>
                <div className="overflow-hidden rounded-md border border-border bg-background">
                  {list.map((c) => (
                    <div
                      key={c.id}
                      onDragOver={(e) => {
                        e.preventDefault();
                        if (overId !== c.id) setOverId(c.id);
                      }}
                      onDrop={() => reorder(type, c.id)}
                      className={`flex flex-wrap items-center gap-[10px] px-[14px] py-[20px] ${overId === c.id ? 'border-t-2 border-foreground' : 'border-t border-border'} ${c.pinned ? 'bg-muted' : 'bg-background'} ${!c.active ? 'opacity-55' : dragId === c.id ? 'opacity-40' : ''}`}
                    >
                      <span
                        draggable
                        onDragStart={() => setDragId(c.id)}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverId(null);
                        }}
                        title="드래그해서 순서 변경"
                        className="cursor-grab select-none text-[15px] leading-none text-muted-foreground"
                      >
                        ⠿
                      </span>
                      {editId === c.id ? (
                        // 이름 변경 모드 — 저장하면 이전에 분류한 거래에도 새 이름이 그대로 반영된다(id 연결)
                        <span className="flex flex-[1_1_200px] items-center gap-2">
                          <input
                            value={editVal}
                            onChange={(e) => setEditVal(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') rename(c);
                              if (e.key === 'Escape') setEditId(null);
                            }}
                            autoFocus
                            className="ta-input flex-1 text-[13px]"
                          />
                          <button
                            onClick={() => rename(c)}
                            disabled={busy === c.id || !editVal.trim()}
                            className="ta-btn-primary whitespace-nowrap text-[11px]"
                          >
                            {busy === c.id ? '저장 중…' : '저장'}
                          </button>
                          <button onClick={() => setEditId(null)} className="ta-btn whitespace-nowrap text-[11px]">
                            취소
                          </button>
                        </span>
                      ) : (
                        <span
                          onClick={() => busy !== c.id && patch(c.id, { pinned: !c.pinned })}
                          title="클릭하면 즐겨찾기(상위노출) 토글"
                          className="flex-[1_1_200px] cursor-pointer select-none text-[13px] text-foreground"
                        >
                          {c.pinned && <span>⭐ </span>}
                          {c.parent_id && <span className="text-muted-foreground">└ </span>}
                          {label(c)}
                        </span>
                      )}
                      {isSystem(c.name) && (
                        <span
                          title="카드·영수증·분할·대체 정산에 쓰이는 계정이라 이름을 바꾸거나 지울 수 없어요"
                          className="whitespace-nowrap rounded-md border border-border px-2 py-1 text-[11px] text-muted-foreground"
                        >
                          ⚙ 시스템 계정
                        </span>
                      )}
                      {!isSystem(c.name) && editId !== c.id && (
                        <button
                          onClick={() => {
                            setEditId(c.id);
                            setEditVal(c.name);
                          }}
                          disabled={busy === c.id}
                          title="이름을 바꿔요 — 이전에 이 계정으로 분류한 거래에도 새 이름이 그대로 반영돼요"
                          className="whitespace-nowrap rounded-md border border-border px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                        >
                          이름 변경
                        </button>
                      )}
                      {VAT_TYPES.includes(c.type) && (
                        <button
                          onClick={() => patch(c.id, { vat_taxable: !c.vat_taxable })}
                          disabled={busy === c.id}
                          title="부가세 과세 여부 — 과세면 손익에서 공급가액(총액÷1.1)으로 순액 처리, 면세는 그대로"
                          className={`whitespace-nowrap rounded-md border px-3 py-1 text-[11px] ${c.vat_taxable ? 'border-border text-foreground' : 'border-transparent bg-muted text-muted-foreground'}`}
                        >
                          {c.vat_taxable ? '과세' : '면세'}
                        </button>
                      )}
                      <button
                        onClick={() => patch(c.id, { active: !c.active })}
                        disabled={busy === c.id}
                        className={`whitespace-nowrap rounded-md border px-3 py-1 text-[11px] ${c.active ? 'border-transparent bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}`}
                      >
                        {c.active ? '활성' : '비활성'}
                      </button>
                      <button
                        onClick={() => remove(c.id)}
                        disabled={busy === c.id || isSystem(c.name)}
                        title={isSystem(c.name) ? '시스템 계정은 삭제할 수 없어요' : undefined}
                        className="whitespace-nowrap rounded-md border border-border px-3 py-1 text-[11px] text-muted-foreground hover:text-destructive disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground"
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2 border-t border-border bg-muted px-[14px] py-[10px]">
                    <input
                      value={newName[type] || ''}
                      onChange={(e) => setNewName((m) => ({ ...m, [type]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && add(type)}
                      placeholder={`${TYPE_LABEL[type]} 항목 추가…`}
                      className="ta-input flex-1 text-[13px]"
                    />
                    <button
                      onClick={() => add(type)}
                      disabled={adding === type || !(newName[type] || '').trim()}
                      className="ta-btn-primary text-[13px]"
                    >
                      {adding === type ? '추가 중…' : '+ 추가'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
