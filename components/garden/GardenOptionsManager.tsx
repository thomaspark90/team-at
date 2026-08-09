'use client';

import { useEffect, useState } from 'react';
import type { GardenOptions, RoasteryAssets } from '@/lib/types';
import { toast } from '@/components/Toast';

// 발주 입력 드롭다운 명단 관리 — 필터 원두 발주의 스탭이름·로스팅사 선택지를 추가/삭제.
// 로스팅사에는 원두카드 인쇄용 로고·QR 이미지를 함께 등록한다.
export default function GardenOptionsManager() {
  const [options, setOptions] = useState<GardenOptions | null>(null);
  const [assets, setAssets] = useState<RoasteryAssets>({});
  // 로스터리별 발주 카톡방 이름 — [발주] 버튼이 이 매핑으로 방을 찾아 전송한다
  const [rooms, setRooms] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/garden-options', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => j && setOptions({ staffNames: j.staffNames ?? [], roasteries: j.roasteries ?? [] }));
    fetch('/api/garden-roastery-assets', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => setAssets(j ?? {}));
    fetch('/api/kakao-notify/rooms', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((j) => setRooms(j ?? {}));
  }, []);

  // 카톡방 매핑 저장 — 빈 값은 서버가 매핑 해제로 처리.
  // 성공해야만 rooms를 갱신한다(낙관적 갱신 금지) — 실패했는데도 저장된 것처럼 보이던 문제(RoomInput 참고).
  const saveRoom = async (roastery: string, room: string): Promise<boolean> => {
    const next = { ...rooms, [roastery]: room };
    const res = await fetch('/api/kakao-notify/rooms', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    });
    if (res.ok) {
      setRooms(await res.json());
      toast('발주 카톡방을 저장했어요.');
      return true;
    }
    toast((await res.json().catch(() => null))?.error ?? '카톡방 저장에 실패했습니다.', 'error');
    return false;
  };

  // 로스터리 로고·QR 업로드/삭제 — 원두카드 인쇄 시 자동 배치.
  // 실패해도 화면에 아무 표시가 없던 문제(카톡방 저장 버그와 같은 클래스) — 토스트로 알린다.
  const uploadAsset = async (roastery: string, kind: 'logo' | 'qr', file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append('roastery', roastery);
      fd.append('kind', kind);
      fd.append('file', file);
      const res = await fetch('/api/garden-roastery-assets', { method: 'POST', body: fd });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? '업로드에 실패했습니다.');
      setAssets(await res.json());
    } catch (e) {
      toast(e instanceof Error ? e.message : '업로드에 실패했습니다.', 'error');
    } finally {
      setBusy(false);
    }
  };
  const removeAsset = async (roastery: string, kind: 'logo' | 'qr') => {
    setBusy(true);
    try {
      const res = await fetch('/api/garden-roastery-assets', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roastery, kind }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? '삭제에 실패했습니다.');
      setAssets(await res.json());
    } catch (e) {
      toast(e instanceof Error ? e.message : '삭제에 실패했습니다.', 'error');
    } finally {
      setBusy(false);
    }
  };

  // 로스터리 이름 변경 — 명단 교체 + 등록된 로고·QR 키·카톡방 매핑도 새 이름으로 이동.
  // 세 요청 중 하나가 실패해도 나머지는 이미 반영됐을 수 있어 각각 개별로 성공/실패를 알린다.
  const renameRoastery = async (from: string, to: string) => {
    if (!options) return;
    const next = to.trim();
    if (!next || next === from || options.roasteries.includes(next)) return;
    await save({ ...options, roasteries: options.roasteries.map((r) => (r === from ? next : r)) });

    setBusy(true);
    try {
      const res = await fetch('/api/garden-roastery-assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: next }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? '로고·QR 이동에 실패했습니다.');
      setAssets(await res.json());
    } catch (e) {
      toast(e instanceof Error ? e.message : '로고·QR 이동에 실패했습니다.', 'error');
    }

    // 카톡방 매핑 키도 새 이름으로 이동
    if (rooms[from]) {
      const moved = { ...rooms, [next]: rooms[from] };
      delete moved[from];
      try {
        const rr = await fetch('/api/kakao-notify/rooms', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(moved),
        });
        if (!rr.ok) throw new Error((await rr.json().catch(() => null))?.error ?? '카톡방 매핑 이동에 실패했습니다.');
        setRooms(await rr.json());
      } catch (e) {
        toast(e instanceof Error ? e.message : '카톡방 매핑 이동에 실패했습니다.', 'error');
      }
    }
    setBusy(false);
  };

  // 스탭이름·로스팅사 명단 저장 — 실패하면 낙관적으로 반영했던 값을 되돌린다.
  const save = async (next: GardenOptions) => {
    const prev = options;
    setBusy(true);
    setOptions(next);
    try {
      const res = await fetch('/api/garden-options', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? '저장에 실패했습니다.');
      setOptions(await res.json());
    } catch (e) {
      setOptions(prev);
      toast(e instanceof Error ? e.message : '저장에 실패했습니다.', 'error');
    } finally {
      setBusy(false);
    }
  };

  if (!options) return null;

  return (
    <div className="min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      <div>
        <p className="text-[15px] font-medium text-foreground" style={{ margin: 0 }}>발주 드롭다운 관리</p>
        <p className="text-[13px] text-muted-foreground" style={{ margin: '2px 0 0' }}>
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
        rooms={rooms}
        busy={busy}
        onChange={(roasteries) => save({ ...options, roasteries })}
        onUpload={uploadAsset}
        onRemoveAsset={removeAsset}
        onRename={renameRoastery}
        onRoomChange={saveRoom}
      />
    </div>
  );
}

// 로스팅사 목록 — 이름 + 원두카드용 로고·QR 이미지 슬롯 + 발주 카톡방
function RoasteryList({
  items,
  assets,
  rooms,
  busy,
  onChange,
  onUpload,
  onRemoveAsset,
  onRename,
  onRoomChange,
}: {
  items: string[];
  assets: RoasteryAssets;
  rooms: Record<string, string>;
  busy: boolean;
  onChange: (items: string[]) => void;
  onUpload: (roastery: string, kind: 'logo' | 'qr', file: File) => void;
  onRemoveAsset: (roastery: string, kind: 'logo' | 'qr') => void;
  onRename: (from: string, to: string) => void;
  onRoomChange: (roastery: string, room: string) => Promise<boolean>;
}) {
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState<string | null>(null); // 수정 중인 항목(원래 이름)
  const [editValue, setEditValue] = useState('');

  const commitEdit = () => {
    if (editing) onRename(editing, editValue);
    setEditing(null);
  };

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

  // 서로 다른 로스팅사가 같은 카톡방 이름을 쓰면 복붙 실수로 오배송될 수 있다 — 경고만, 저장은 막지 않는다.
  const roomOwners = new Map<string, string[]>();
  for (const [roastery, room] of Object.entries(rooms)) {
    const r = room.trim();
    if (!r) continue;
    roomOwners.set(r, [...(roomOwners.get(r) ?? []), roastery]);
  }
  const sharedWith = (v: string): string[] => {
    const r = (rooms[v] ?? '').trim();
    if (!r) return [];
    return (roomOwners.get(r) ?? []).filter((x) => x !== v);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p className="text-[11px] text-muted-foreground" style={{ margin: 0 }}>
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
        <p className="text-[13px] text-muted-foreground" style={{ margin: 0 }}>
          아직 등록된 항목이 없어요. 발주 화면에서 직접 입력해 저장해도 여기에 추가됩니다.
        </p>
      ) : (
        // 항목 박스의 보더 제거 — 카톡방 인풋이 자체 보더를 가져 3겹이 됐었다. 가는 구분선 행으로 (2026-08-08)
        <div className="divide-y divide-border/60">
          {items.map((v) => (
            <div
              key={v}
              style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '20px 0', minWidth: 0 }}
            >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {editing === v ? (
                <>
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitEdit();
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    autoFocus
                    className="ta-input"
                    style={{ flex: 1, minWidth: 0, height: 30 }}
                  />
                  <button
                    onClick={commitEdit}
                    disabled={busy || editValue.trim() === '' || (editValue.trim() !== v && items.includes(editValue.trim()))}
                    className="ta-btn-primary"
                    style={{ height: 28, paddingLeft: 10, paddingRight: 10, fontSize: 13, flexShrink: 0 }}
                  >
                    저장
                  </button>
                  <button
                    onClick={() => setEditing(null)}
                    className="ta-btn"
                    style={{ height: 28, paddingLeft: 10, paddingRight: 10, fontSize: 13, flexShrink: 0 }}
                  >
                    취소
                  </button>
                </>
              ) : (
                <>
                  <span className="text-[13px] text-foreground" style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {v}
                  </span>
                  <button
                    onClick={() => {
                      setEditing(v);
                      setEditValue(v);
                    }}
                    disabled={busy}
                    className="text-muted-foreground hover:text-foreground"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: 6, margin: -6, flexShrink: 0 }}
                    title="이름 수정 — 등록된 로고·QR도 새 이름으로 유지"
                  >
                    수정
                  </button>
                </>
              )}
              <AssetSlot label="로고" url={assets[v]?.logo} busy={busy} onUpload={(f) => onUpload(v, 'logo', f)} onRemove={() => onRemoveAsset(v, 'logo')} />
              <AssetSlot label="QR" url={assets[v]?.qr} busy={busy} onUpload={(f) => onUpload(v, 'qr', f)} onRemove={() => onRemoveAsset(v, 'qr')} />
              <button
                onClick={() => remove(v)}
                disabled={busy}
                className="text-muted-foreground hover:text-foreground"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 6, margin: -6, lineHeight: 1, flexShrink: 0 }}
                title="삭제"
              >
                ×
              </button>
            </div>
            <RoomInput
              value={rooms[v] ?? ''}
              busy={busy}
              onSave={(room) => onRoomChange(v, room)}
              sharedWith={sharedWith(v)}
            />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// 발주 카톡방 입력 — [발주] 버튼이 이 이름으로 맥 카톡앱에서 방을 검색해 전송한다.
// 카톡 채팅 리스트의 표시 이름과 '정확히' 일치해야 하며, 비우면 매핑 해제(전송 차단).
// blur 시 조용히 저장되던 걸 명시적 '저장' 버튼으로 바꿨다 — 저장됐는지 알 길이 없어 헷갈린다는 피드백(2026-08-09).
// 실패하면 입력값을 원래 값으로 되돌린다 — 실패했는데도 새 값이 남아 저장된 것처럼 보이던 문제 방지.
function RoomInput({
  value,
  busy,
  onSave,
  sharedWith,
}: {
  value: string;
  busy: boolean;
  onSave: (room: string) => Promise<boolean>;
  sharedWith: string[]; // 같은 카톡방 이름을 쓰는 다른 로스팅사 — 복붙 실수 경고용
}) {
  const [v, setV] = useState(value);
  const [saving, setSaving] = useState(false);
  useEffect(() => setV(value), [value]);
  const dirty = v.trim() !== value.trim();

  const commit = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    const ok = await onSave(v.trim());
    setSaving(false);
    if (!ok) setV(value);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span className="text-[11px] text-muted-foreground" style={{ flexShrink: 0 }}>발주 카톡방</span>
        <input
          type="text"
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') setV(value);
          }}
          placeholder="카톡 채팅방 표시 이름 (정확히 일치해야 전송됨)"
          className="ta-input"
          style={{ flex: 1, minWidth: 0, height: 28 }}
          disabled={busy || saving}
        />
        <button
          onClick={commit}
          disabled={busy || saving || !dirty}
          className="ta-btn-primary"
          style={{ height: 28, paddingLeft: 10, paddingRight: 10, fontSize: 12, flexShrink: 0, opacity: dirty ? 1 : 0.4 }}
        >
          {saving ? '저장 중…' : '저장'}
        </button>
      </label>
      {!dirty && sharedWith.length > 0 && (
        <p className="text-[11px]" style={{ margin: 0, marginLeft: 78, color: 'hsl(38 92% 40%)' }}>
          ⚠ {sharedWith.join(', ')}와 같은 카톡방을 쓰고 있어요 — 복붙 실수가 아니라면 무시해도 됩니다.
        </p>
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
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, padding: 6, margin: -6 }}
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
      <p className="text-[11px] text-muted-foreground" style={{ margin: 0 }}>{title}</p>
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
        <p className="text-[13px] text-muted-foreground" style={{ margin: 0 }}>
          아직 등록된 항목이 없어요. 발주 화면에서 직접 입력해 저장해도 여기에 추가됩니다.
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {items.map((v) => (
            <span
              key={v}
              className="rounded-md border border-border text-[11px] text-foreground"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 8px' }}
            >
              {display ? display(v) : v}
              <button
                onClick={() => remove(v)}
                disabled={busy}
                className="text-muted-foreground hover:text-foreground"
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: 4, lineHeight: 1 }}
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
