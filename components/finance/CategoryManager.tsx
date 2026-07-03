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
}

const TYPE_LABEL: Record<string, string> = {
  revenue: '매출',
  cogs: '재료비(원가)',
  sga: '판매관리비',
  non_operating: '영업외',
  excluded: '손익 제외',
};
// 5개 계정 타입을 입금/출금 2그룹으로 묶어 보여줌
const GROUPS = [
  { title: '📥 입금 (들어오는 돈)', hint: '매출과 영업외수익', types: ['revenue', 'non_operating'] },
  { title: '📤 출금 (나가는 돈)', hint: '재료비·판매관리비·자본적지출 등', types: ['cogs', 'sga', 'excluded'] },
];
const ACCENT = '#0099FF';

export default function CategoryManager({ initial }: { initial: ManagedCat[] }) {
  const [cats, setCats] = useState<ManagedCat[]>(initial);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState<string | null>(null);

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
      .select('id,type,name,parent_id,active,pinned,sort')
      .single();
    if (error) setError(error.message);
    else if (data) {
      setCats((list) => [...list, data as ManagedCat]);
      setNewName((m) => ({ ...m, [type]: '' }));
    }
    setAdding(null);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <p style={{ fontSize: 13, color: '#888', margin: 0 }}>
        <b>항목 이름을 클릭</b>하면 ⭐즐겨찾기로 지정돼 <b>맨 앞으로 이동</b>하고 분류 드롭다운 맨 위 &ldquo;자주 쓰는&rdquo;에도 떠요(다시 클릭하면 해제). <b>활성</b>을 끄면 목록에서 숨겨져요(삭제 아님).
      </p>
      {error && <div style={{ color: '#b23b3b', fontSize: 13 }}>⚠️ {error}</div>}

      {GROUPS.map((group) => (
        <div key={group.title} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0, letterSpacing: '-0.3px' }}>{group.title}</h2>
            <p style={{ fontSize: 12, color: '#999', margin: '2px 0 0' }}>{group.hint}</p>
          </div>

          {group.types.map((type) => {
            const list = cats
              .filter((c) => c.type === type)
              .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.sort - b.sort);
            return (
              <div key={type}>
                <h3 style={{ fontSize: 13, fontWeight: 700, margin: '0 0 8px', color: '#666' }}>{TYPE_LABEL[type]}</h3>
                <div style={{ background: '#fff', border: '1px solid #E5E5E5', borderRadius: 12, overflow: 'hidden' }}>
                  {list.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 16px',
                        borderTop: '1px solid #F0F0F0',
                        background: c.pinned ? '#FFFBEB' : c.active ? '#fff' : '#FAFAFA',
                        opacity: c.active ? 1 : 0.55,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span
                        onClick={() => busy !== c.id && patch(c.id, { pinned: !c.pinned })}
                        title="클릭하면 즐겨찾기(상위노출) 토글 — 맨 앞으로 이동"
                        style={{
                          flex: '1 1 200px',
                          fontSize: 14,
                          fontWeight: c.parent_id ? 400 : 600,
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        {c.pinned && <span style={{ color: '#B08900' }}>⭐ </span>}
                        {c.parent_id && <span style={{ color: '#bbb' }}>└ </span>}
                        {label(c)}
                      </span>
                      <button
                        onClick={() => patch(c.id, { active: !c.active })}
                        disabled={busy === c.id}
                        style={pill(c.active ? ACCENT : '#999', c.active ? '#EAF5FF' : '#F2F2F2')}
                      >
                        {c.active ? '활성' : '비활성'}
                      </button>
                      <button
                        onClick={() => remove(c.id)}
                        disabled={busy === c.id}
                        style={{ ...pill('#b23b3b', '#fff'), border: 'none' }}
                      >
                        삭제
                      </button>
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, padding: '10px 16px', borderTop: '1px solid #F0F0F0', background: '#FAFBFC' }}>
                    <input
                      value={newName[type] || ''}
                      onChange={(e) => setNewName((m) => ({ ...m, [type]: e.target.value }))}
                      onKeyDown={(e) => e.key === 'Enter' && add(type)}
                      placeholder={`${TYPE_LABEL[type]} 항목 추가…`}
                      style={{ flex: 1, fontSize: 13, padding: '7px 12px', border: '1px solid #DDD', borderRadius: 8, fontFamily: 'inherit' }}
                    />
                    <button
                      onClick={() => add(type)}
                      disabled={adding === type || !(newName[type] || '').trim()}
                      style={{ ...pill('#fff', (newName[type] || '').trim() ? '#000' : '#CCC'), border: 'none', fontWeight: 700 }}
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

function pill(color: string, bg: string): React.CSSProperties {
  return {
    fontSize: 12,
    fontWeight: 600,
    padding: '5px 12px',
    borderRadius: 20,
    border: `1px solid ${color === '#fff' ? bg : color}`,
    background: bg,
    color: color === '#fff' ? '#fff' : color,
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap',
  };
}
