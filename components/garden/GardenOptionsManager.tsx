'use client';

import { useEffect, useState } from 'react';
import type { GardenOptions } from '@/lib/types';

// 발주 입력 드롭다운 명단 관리 — 필터 원두 발주의 스탭이름·로스팅사 선택지를 추가/삭제
export default function GardenOptionsManager() {
  const [options, setOptions] = useState<GardenOptions | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/garden-options', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setOptions({ staffNames: j.staffNames ?? [], roasteries: j.roasteries ?? [] }));
  }, []);

  const save = async (next: GardenOptions) => {
    setBusy(true);
    setOptions(next);
    const res = await fetch('/api/garden-options', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (res.ok) setOptions(await res.json());
    setBusy(false);
  };

  if (!options) return null;

  return (
    <div className="ta-card bg-background min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <p className="text-[14px] font-medium text-foreground" style={{ margin: 0 }}>발주 드롭다운 관리</p>
        <p className="text-[12px] text-muted-foreground" style={{ margin: '2px 0 0' }}>
          필터 원두 발주 화면의 스탭이름·로스팅사 선택지를 관리합니다.
        </p>
      </div>
      <OptionList
        title="스탭이름"
        placeholder="스탭이름 추가 (예: 홍길동)"
        items={options.staffNames}
        busy={busy}
        display={(n) => `${n}님`}
        onChange={(staffNames) => save({ ...options, staffNames })}
      />
      <OptionList
        title="로스팅사"
        placeholder="로스팅사 추가 (예: 언스페셜티)"
        items={options.roasteries}
        busy={busy}
        onChange={(roasteries) => save({ ...options, roasteries })}
      />
    </div>
  );
}

function OptionList({
  title,
  placeholder,
  items,
  busy,
  display,
  onChange,
}: {
  title: string;
  placeholder: string;
  items: string[];
  busy: boolean;
  display?: (v: string) => string;
  onChange: (items: string[]) => void;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const v = input.trim();
    if (!v || busy || items.includes(v)) return;
    setInput('');
    onChange([...items, v]);
  };
  const remove = (v: string) => {
    if (!confirm(`'${display ? display(v) : v}' 항목을 삭제할까요? (기존 발주 기록에는 영향 없음)`)) return;
    onChange(items.filter((x) => x !== v));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p className="text-[12px] text-muted-foreground" style={{ margin: 0 }}>{title}</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder={placeholder}
          className="ta-input"
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          onClick={add}
          disabled={busy || input.trim() === ''}
          className="ta-btn-primary"
          style={{ height: 36, paddingLeft: 14, paddingRight: 14 }}
        >
          추가
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-[12px] text-muted-foreground" style={{ margin: 0 }}>
          아직 등록된 항목이 없어요. 발주 화면에서 직접 입력해 저장해도 여기에 추가됩니다.
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {items.map((v) => (
            <span
              key={v}
              className="rounded-md border border-border text-[12px] text-foreground"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px' }}
            >
              {display ? display(v) : v}
              <button
                onClick={() => remove(v)}
                disabled={busy}
                className="text-muted-foreground hover:text-foreground"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1 }}
                title="삭제"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
