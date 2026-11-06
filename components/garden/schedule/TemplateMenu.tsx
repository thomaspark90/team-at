'use client';

import { useCallback, useEffect, useState } from 'react';
import { TEMPLATE_NAME_MAX } from '@/lib/schedule/types';
import type { StoreId } from '@/lib/types';

// 주 템플릿 — 이번 주 계획을 이름 붙여 저장, 다른 주에 불러오기, 삭제. 지점별 목록.
type Tpl = { id: number; name: string; count: number; createdAt: string };
const api = '/api/garden-schedule/templates';
const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export default function TemplateMenu({
  store,
  weekStart,
  hasPlan,
  onApplied,
}: {
  store: StoreId;
  weekStart: string;
  hasPlan: boolean; // 이번 주 이 지점에 계획이 있는가 — 저장 가능 여부
  onApplied: (notice: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Tpl[] | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`${api}?store=${store}`, { cache: 'no-store' });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setError(j.error ?? '불러오지 못했습니다.');
    setList(j.templates);
  }, [store]);
  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const run = async (fn: () => Promise<Response>, after: (j: any) => void) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.status === 409 && j.existing != null) return j; // 호출자가 덮어쓰기 확인
    if (!r.ok) return setError(j.error ?? '실패했습니다.');
    after(j);
  };

  const save = () =>
    run(
      () => fetch(api, json('POST', { store, weekStart, name })),
      (j) => {
        setName('');
        load();
        onApplied(`'${name.trim()}' 템플릿으로 저장했습니다(${j.count}건).`);
      },
    );
  const apply = async (t: Tpl, overwrite = false) => {
    const conflict = await run(
      () => fetch(`${api}/apply`, json('POST', { id: t.id, weekStart, overwrite })),
      (j) => {
        setOpen(false);
        onApplied(`'${j.name}' 템플릿 ${j.copied}건을 불러왔습니다.${j.skipped ? ` 퇴사자 ${j.skipped}명은 뺐습니다.` : ''}`);
      },
    );
    if (conflict && window.confirm(`이번 주에 이미 계획 ${conflict.existing}건이 있습니다. 지우고 '${t.name}'으로 덮어쓸까요?`)) apply(t, true);
  };
  const remove = (t: Tpl) => {
    if (!window.confirm(`'${t.name}' 템플릿을 삭제할까요?`)) return;
    run(() => fetch(api, json('DELETE', { id: t.id })), load);
  };

  return (
    <>
      <button type="button" className="ta-btn" onClick={() => setOpen(true)}>주 템플릿</button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/20 p-4" onClick={() => setOpen(false)}>
          <div role="dialog" aria-modal="true" className="ta-card w-full max-w-[460px]" onClick={(e) => e.stopPropagation()}>
            <h2 className="m-0 text-title">주 템플릿</h2>
            <p className="m-0 mt-1 text-caption text-muted-foreground">한 주 계획을 통째로 저장해 두고 다른 주에 불러옵니다. 지점별로 따로 저장됩니다.</p>

            <ul className="m-0 mt-4 list-none divide-y divide-border p-0">
              {list === null && <li className="py-2 text-body text-muted-foreground">불러오는 중…</li>}
              {list?.length === 0 && <li className="py-2 text-body text-muted-foreground">저장된 템플릿이 없습니다.</li>}
              {list?.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <span className="text-body">{t.name}</span>
                  <span className="text-caption text-muted-foreground">{t.count}건 · {t.createdAt.slice(0, 10)}</span>
                  <span className="ml-auto flex gap-3 text-caption">
                    <button type="button" className="text-foreground underline underline-offset-2" disabled={busy} onClick={() => apply(t)}>이 주에 불러오기</button>
                    <button type="button" className="text-muted-foreground" disabled={busy} onClick={() => remove(t)}>삭제</button>
                  </span>
                </li>
              ))}
            </ul>

            <form
              className="mt-5 flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <input
                aria-label="템플릿 이름"
                className="ta-input flex-1"
                placeholder={hasPlan ? '이번 주 계획을 저장할 이름' : '이번 주에 저장할 계획이 없습니다'}
                maxLength={TEMPLATE_NAME_MAX}
                value={name}
                disabled={!hasPlan}
                onChange={(e) => setName(e.target.value)}
              />
              <button type="submit" className="ta-btn" disabled={busy || !hasPlan || !name.trim()}>저장</button>
            </form>
            {error && <p className="m-0 mt-3 text-body text-destructive">{error}</p>}
            <div className="mt-5 flex justify-end">
              <button type="button" className="ta-btn" onClick={() => setOpen(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
