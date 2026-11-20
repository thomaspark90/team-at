'use client';

import { useState } from 'react';
import { toast } from '@/components/Toast';
import { groupByCategory, oneLine, type NametagCatalog, type NametagItem } from '@/lib/garden/nametags';
import NametagItemForm, { type ItemFormValue } from './NametagItemForm';
import { ACT_SUB, API, call, failed, jsonInit } from './shared';

// 메뉴 관리 — 추가·수정·삭제. 바꾸면 바로 저장되고 다음 요청부터 적용된다(이미 보낸 요청의 문구는 그대로).

type Saved = { catalog: NametagCatalog };

export default function NametagMenuEditor({ catalog, onCatalog }: { catalog: NametagCatalog; onCatalog: (c: NametagCatalog) => void }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null); // 카테고리 id, '' = 맨 위 추가
  const groups = groupByCategory(catalog);

  const save = async (method: 'POST' | 'PATCH', body: Record<string, unknown>, okMessage: string) => {
    const j = await call<Saved>(API, jsonInit(method, body));
    if (failed(j)) {
      toast(j.error, 'error');
      return false;
    }
    onCatalog(j.catalog);
    setEditing(null);
    setAdding(null);
    toast(okMessage);
    return true;
  };

  const remove = async (item: NametagItem) => {
    if (!window.confirm(`'${oneLine(item.ko)}' 메뉴를 목록에서 지울까요?`)) return;
    const j = await call<Saved>(API, jsonInit('DELETE', { id: item.id }));
    if (failed(j)) return toast(j.error, 'error');
    onCatalog(j.catalog);
    toast('지웠어요');
  };

  const form = (initial?: NametagItem, defaultCategory?: string) => (
    <NametagItemForm
      categories={catalog.categories}
      initial={initial}
      defaultCategory={defaultCategory}
      onCancel={() => {
        setEditing(null);
        setAdding(null);
      }}
      onSubmit={(v: ItemFormValue) => (initial ? save('PATCH', { id: initial.id, ...v }, '저장했어요') : save('POST', v, '추가했어요'))}
    />
  );

  return (
    <div className="space-y-8">
      {adding === '' ? (
        form()
      ) : (
        <button type="button" className={ACT_SUB} onClick={() => setAdding('')}>
          + 메뉴 추가
        </button>
      )}
      {groups.map((g) => (
        <section key={g.category.id}>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <h3 className="m-0 text-body font-medium">
              {g.category.label} <span className="text-caption text-muted-foreground">{g.items.length}</span>
            </h3>
            <button type="button" className="text-caption text-muted-foreground underline decoration-border underline-offset-4" onClick={() => setAdding(g.category.id)}>
              + 여기에 추가
            </button>
          </div>
          {adding === g.category.id && <div className="mb-3">{form(undefined, g.category.id)}</div>}
          <ul className="m-0 list-none p-0">
            {g.items.map((i) =>
              editing === i.id ? (
                <li key={i.id} className="py-3">
                  {form(i)}
                </li>
              ) : (
                <li key={i.id} className="flex items-center justify-between gap-3 border-b border-border py-3">
                  <div className="min-w-0">
                    <p className="m-0 text-body">{oneLine(i.ko)}</p>
                    <p className="m-0 truncate text-caption text-muted-foreground">{[i.en, oneLine(i.desc)].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div className="flex shrink-0 gap-5">
                    <button type="button" className={ACT_SUB} onClick={() => setEditing(i.id)}>
                      수정
                    </button>
                    <button type="button" className={ACT_SUB} onClick={() => remove(i)}>
                      삭제
                    </button>
                  </div>
                </li>
              ),
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
