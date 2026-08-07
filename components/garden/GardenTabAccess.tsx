'use client';

import { useEffect, useState } from 'react';
import { GARDEN_TABS, GARDEN_TAB_KEYS } from '@/lib/garden/tabs';
import { SECTIONS, SECTION_KEYS } from '@/lib/access/sections';

type UserRow = { id: string; email: string; tabs: string[] | null; sections: string[] | null };
type Kind = 'tabs' | 'sections';

// 페이지 접근 권한 — 사용자별로 상위 섹션과 가든 하위 탭을 토글로 켜고 끈다. (admin 전용)
// 전부 켜짐 = 제한 없음, 일부 끄면 허용 목록으로 저장되고 미들웨어가 서버에서 강제한다.

function Toggle({
  on,
  disabled,
  onChange,
  label,
}: {
  on: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className="shrink-0 rounded-full transition-colors"
      style={{
        width: 40,
        height: 22,
        padding: 2,
        border: '1px solid hsl(var(--border))',
        background: on ? 'hsl(var(--foreground))' : 'hsl(var(--muted))',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        className="block rounded-full transition-transform"
        style={{
          width: 16,
          height: 16,
          background: on ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))',
          transform: on ? 'translateX(18px)' : 'translateX(0)',
        }}
      />
    </button>
  );
}

function Row({
  label,
  desc,
  on,
  disabled,
  onChange,
}: {
  label: string;
  desc?: string;
  on: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  return (
    <div
      className="flex items-start justify-between gap-4 border-t border-border"
      style={{ paddingTop: 10, paddingBottom: 10 }}
    >
      <div style={{ minWidth: 0 }}>
        <div className={`text-[13px] ${on ? 'text-foreground' : 'text-muted-foreground'}`} style={{ fontWeight: 500 }}>
          {label}
        </div>
        {desc && (
          <div className="text-[12px] text-muted-foreground" style={{ marginTop: 2, lineHeight: 1.5 }}>
            {desc}
          </div>
        )}
      </div>
      <Toggle on={on} disabled={disabled} onChange={onChange} label={label} />
    </div>
  );
}

export default function GardenTabAccess({ initial }: { initial: UserRow[] }) {
  const [users, setUsers] = useState<UserRow[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    setUsers(initial);
  }, [initial]);

  const allowedSet = (u: UserRow, kind: Kind) =>
    new Set(u[kind] ?? (kind === 'tabs' ? GARDEN_TAB_KEYS : SECTION_KEYS));

  const toggle = async (u: UserRow, kind: Kind, key: string) => {
    const next = allowedSet(u, kind);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    const all = kind === 'tabs' ? GARDEN_TAB_KEYS : SECTION_KEYS;
    const value = all.filter((k) => next.has(k));
    setBusyId(u.id);
    setError('');
    try {
      const res = await fetch('/api/garden-tab-access', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId: u.id, email: u.email, [kind]: value }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? '저장에 실패했습니다.');
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, tabs: json.tabs, sections: json.sections } : x)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장에 실패했습니다.');
    } finally {
      setBusyId(null);
    }
  };

  const summary = (u: UserRow) => {
    const s = u.sections === null ? SECTION_KEYS.length : u.sections.length;
    const t = u.tabs === null ? GARDEN_TAB_KEYS.length : u.tabs.length;
    if (u.sections === null && u.tabs === null) return '전체 접근';
    return `섹션 ${s}/${SECTION_KEYS.length} · 가든 탭 ${t}/${GARDEN_TAB_KEYS.length}`;
  };

  return (
    <section className="rounded-lg border border-border bg-card/40" style={{ padding: 16 }}>
      <h2 className="text-[14px] font-medium" style={{ margin: '0 0 4px' }}>
        페이지 접근 권한
      </h2>
      <p className="text-[12px] text-muted-foreground" style={{ margin: '0 0 12px', lineHeight: 1.6 }}>
        계정별로 접근할 수 있는 화면을 지정합니다. 끈 항목은 나비에서 숨겨지고, 주소로 직접 접근해도 서버에서
        차단됩니다. 대표 계정은 항상 전체 접근이라 목록에 없습니다.
      </p>
      {error && (
        <p className="text-[12px]" style={{ color: 'hsl(0 72% 45%)', margin: '0 0 8px' }}>
          {error}
        </p>
      )}
      {users.length === 0 && (
        <p className="text-[13px] text-muted-foreground" style={{ margin: 0 }}>
          표시할 사용자가 없습니다.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {users.map((u) => {
          const open = openId === u.id;
          const sec = allowedSet(u, 'sections');
          const tab = allowedSet(u, 'tabs');
          const gardenOn = sec.has('garden');
          return (
            <div key={u.id} className="rounded-lg border border-border bg-background" style={{ padding: 12 }}>
              <button
                onClick={() => setOpenId(open ? null : u.id)}
                className="flex w-full items-center justify-between gap-3 text-left"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <span style={{ minWidth: 0 }}>
                  <span className="block text-[13px] font-medium text-foreground">{u.email}</span>
                  <span className="block text-[12px] text-muted-foreground" style={{ marginTop: 2 }}>
                    {summary(u)}
                    {busyId === u.id && ' · 저장 중…'}
                  </span>
                </span>
                <span className="text-[12px] text-muted-foreground" style={{ flexShrink: 0 }}>
                  {open ? '접기 ▲' : '권한 설정 ▼'}
                </span>
              </button>

              {open && (
                <div style={{ marginTop: 12 }}>
                  <p className="ta-label" style={{ marginBottom: 0 }}>
                    상위 메뉴
                  </p>
                  {SECTIONS.map((s) => (
                    <Row
                      key={s.key}
                      label={s.label}
                      desc={s.desc}
                      on={sec.has(s.key)}
                      disabled={busyId === u.id}
                      onChange={() => toggle(u, 'sections', s.key)}
                    />
                  ))}

                  <p className="ta-label" style={{ marginTop: 16, marginBottom: 0 }}>
                    Garden Service 하위 탭
                  </p>
                  {!gardenOn && (
                    <p className="text-[12px] text-muted-foreground" style={{ margin: '4px 0 0' }}>
                      Garden Service 접근이 꺼져 있어 하위 탭 설정은 적용되지 않습니다.
                    </p>
                  )}
                  <div style={{ opacity: gardenOn ? 1 : 0.45 }}>
                    {GARDEN_TABS.map((t) => (
                      <Row
                        key={t.key}
                        label={t.label}
                        desc={t.desc}
                        on={tab.has(t.key)}
                        disabled={busyId === u.id || !gardenOn}
                        onChange={() => toggle(u, 'tabs', t.key)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
