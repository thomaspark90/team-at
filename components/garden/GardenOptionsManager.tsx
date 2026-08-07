'use client';

import { useEffect, useState } from 'react';
import type { GardenOptions, RoasteryAssets } from '@/lib/types';

// 발주 입력 드롭다운 명단 관리 — 필터 원두 발주의 스탭이름·로스팅사 선택지를 추가/삭제.
// 로스팅사에는 원두카드 인쇄용 로고·QR 이미지를 함께 등록한다.
export default function GardenOptionsManager() {
  const [options, setOptions] = useState<GardenOptions | null>(null);
  const [assets, setAssets] = useState<RoasteryAssets>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/garden-options', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setOptions({ staffNames: j.staffNames ?? [], roasteries: j.roasteries ?? [] }));
    fetch('/api/garden-roastery-assets', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => setAssets(j ?? {}));
  }, []);

  // 로스터리 로고·QR 업로드/삭제 — 원두카드 인쇄 시 자동 배치
  const uploadAsset = async (roastery: string, kind: 'logo' | 'qr', file: File) => {
    setBusy(true);
    const fd = new FormData();
    fd.append('roastery', roastery);
    fd.append('kind', kind);
    fd.append('file', file);
    const res = await fetch('/api/garden-roastery-assets', { method: 'POST', body: fd });
    if (res.ok) setAssets(await res.json());
    setBusy(false);
  };
  const removeAsset = async (roastery: string, kind: 'logo' | 'qr') => {
    setBusy(true);
    const res = await fetch('/api/garden-roastery-assets', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roastery, kind }),
    });
    if (res.ok) setAssets(await res.json());
    setBusy(false);
  };

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
      <RoasteryList
        items={options.roasteries}
        assets={assets}
        busy={busy}
        onChange={(roasteries) => save({ ...options, roasteries })}
        onUpload={uploadAsset}
        onRemoveAsset={removeAsset}
      />
    </div>
  );
}

// 로스팅사 목록 — 이름 + 원두카드용 로고·QR 이미지 슬롯
function RoasteryList({
  items,
  assets,
  busy,
  onChange,
  onUpload,
  onRemoveAsset,
}: {
  items: string[];
  assets: RoasteryAssets;
  busy: boolean;
  onChange: (items: string[]) => void;
  onUpload: (roastery: string, kind: 'logo' | 'qr', file: File) => void;
  onRemoveAsset: (roastery: string, kind: 'logo' | 'qr') => void;
}) {
  const [input, setInput] = useState('');

  const add = () => {
    const v = input.trim();
    if (!v || busy || items.includes(v)) return;
    setInput('');
    onChange([...items, v]);
  };
  const remove = (v: string) => {
    if (!confirm(`'${v}' 로스팅사를 삭제할까요? (기존 발주 기록에는 영향 없음)`)) return;
    onChange(items.filter((x) => x !== v));
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p className="text-[12px] text-muted-foreground" style={{ margin: 0 }}>
        로스팅사 <span style={{ opacity: 0.7 }}>— 로고·QR을 등록하면 원두카드에 자동 배치됩니다</span>
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="로스팅사 추가 (예: 언스페셜티)"
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {items.map((v) => (
            <div
              key={v}
              className="rounded-md border border-border"
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', minWidth: 0 }}
            >
              <span className="text-[13px] text-foreground" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {v}
              </span>
              <AssetSlot label="로고" url={assets[v]?.logo} busy={busy} onUpload={(f) => onUpload(v, 'logo', f)} onRemove={() => onRemoveAsset(v, 'logo')} />
              <AssetSlot label="QR" url={assets[v]?.qr} busy={busy} onUpload={(f) => onUpload(v, 'qr', f)} onRemove={() => onRemoveAsset(v, 'qr')} />
              <button
                onClick={() => remove(v)}
                disabled={busy}
                className="text-muted-foreground hover:text-foreground"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, padding: 0, lineHeight: 1, flexShrink: 0 }}
                title="삭제"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 이미지 슬롯 — 미등록이면 업로드 버튼, 등록되면 썸네일(클릭=교체) + × 제거
function AssetSlot({
  label,
  url,
  busy,
  onUpload,
  onRemove,
}: {
  label: string;
  url?: string;
  busy: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
      <label
        className={url ? '' : 'ta-btn'}
        style={{ cursor: busy ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4, ...(url ? {} : { height: 26, paddingLeft: 8, paddingRight: 8, fontSize: 11 }) }}
        title={url ? `${label} 교체` : `${label} 업로드`}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} style={{ height: 26, maxWidth: 52, objectFit: 'contain', borderRadius: 3, background: '#fff' }} />
        ) : (
          `${label} 업로드`
        )}
        <input
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) onUpload(f);
          }}
        />
      </label>
      {url && (
        <button
          onClick={onRemove}
          disabled={busy}
          className="text-muted-foreground hover:text-foreground"
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: 0 }}
          title={`${label} 제거`}
        >
          ×
        </button>
      )}
    </span>
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
