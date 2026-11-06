'use client';

import { STORES, type StoreId } from '@/lib/types';

// 근무 지점 토글 — 역할 편집 창과 직원 명부가 같이 쓴다. 기본 지점은 끌 수 없다(근무표의 기준 지점).
export default function StoreToggles({
  name,
  stores,
  homeStore,
  disabled,
  onChange,
}: {
  name: string;
  stores: StoreId[];
  homeStore: StoreId;
  disabled?: boolean;
  onChange: (stores: StoreId[]) => void;
}) {
  return (
    <div className="ta-seg" role="group" aria-label={`${name} 근무 지점`}>
      {STORES.map((s) => {
        const on = stores.includes(s.id);
        const fixed = s.id === homeStore;
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={on}
            disabled={disabled || fixed}
            title={fixed ? '기본 지점' : undefined}
            className={`ta-seg-item px-2 text-caption disabled:cursor-default ${on ? 'ta-seg-on' : ''}`}
            onClick={() => onChange(on ? stores.filter((x) => x !== s.id) : [...stores, s.id])}
          >
            {s.short}
          </button>
        );
      })}
    </div>
  );
}
