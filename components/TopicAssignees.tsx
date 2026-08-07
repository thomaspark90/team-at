'use client';

import { useEffect, useState } from 'react';
import type { GardenTopicId, GardenTopicMap, TopicScope } from '@/lib/garden-notify-topics';
import { EMPTY_TOPICS, topicsOfScope } from '@/lib/garden-notify-topics';
import NotifySettings from '@/components/NotifySettings';

// 항목별 알림 담당자 — 브랜드(scope)별 토픽만 보여준다.
// 가든 설정과 스탭밀 설정이 같은 UI 를 쓰되 다루는 항목만 다르다.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const chip: React.CSSProperties = { padding: '3px 10px', display: 'inline-flex', alignItems: 'center', gap: 6 };

export default function TopicAssignees({
  scope,
  title = '알림',
  intro,
}: {
  scope: TopicScope;
  title?: string;
  intro?: string;
}) {
  const [map, setMap] = useState<GardenTopicMap>(EMPTY_TOPICS);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/garden-notify-topics', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : EMPTY_TOPICS))
      .then((d) => setMap({ ...EMPTY_TOPICS, ...d }));
  }, []);

  const save = async (topic: GardenTopicId, emails: string[]) => {
    setBusy(true);
    setError(null);
    const res = await fetch('/api/garden-notify-topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, emails }),
    });
    if (res.ok) setMap({ ...EMPTY_TOPICS, ...(await res.json()) });
    else setError((await res.json().catch(() => null))?.error ?? '저장에 실패했어요.');
    setBusy(false);
  };

  const add = (topic: GardenTopicId) => {
    const email = (inputs[topic] ?? '').trim().toLowerCase();
    if (!email || busy) return;
    if (!EMAIL_RE.test(email)) return setError('올바른 이메일을 입력하세요.');
    setInputs((p) => ({ ...p, [topic]: '' }));
    save(topic, Array.from(new Set([...map[topic], email])));
  };

  return (
    <div className="ta-card bg-background min-w-0" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <p className="text-[14px] font-medium text-foreground" style={{ margin: 0 }}>{title}</p>
        <p className="text-[12px] text-muted-foreground" style={{ margin: '2px 0 0' }}>
          {intro ??
            '아래 내 수신 채널에서 받을 방법을 켜고, 항목별 담당자에서 각 알림을 누가 받을지 지정합니다. 담당자로 지정돼도 본인이 푸시를 켜야 기기 알림이 옵니다.'}
        </p>
      </div>

      <div>
        <p className="ta-label" style={{ margin: '0 0 6px' }}>내 수신 채널</p>
        <NotifySettings bare />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <p className="ta-label" style={{ margin: 0 }}>항목별 담당자</p>
        {topicsOfScope(scope).map((t) => (
          <div key={t.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span className="text-[13px] font-medium text-foreground">{t.label}</span>
              <span className="text-[11px] text-muted-foreground">{t.desc}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              {map[t.id].map((email) => (
                <span key={email} className="rounded-full border border-border text-[12px] text-foreground" style={chip}>
                  {email.split('@')[0]}
                  <button
                    onClick={() => save(t.id, map[t.id].filter((e) => e !== email))}
                    disabled={busy}
                    className="text-muted-foreground hover:text-foreground"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontSize: 12 }}
                    title={`${email} 제거`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                type="email"
                value={inputs[t.id] ?? ''}
                onChange={(e) => setInputs((p) => ({ ...p, [t.id]: e.target.value }))}
                onKeyDown={(e) => e.key === 'Enter' && add(t.id)}
                placeholder="이메일 추가"
                className="ta-input"
                style={{ height: 30, width: 190, fontSize: 12 }}
              />
              <button
                onClick={() => add(t.id)}
                disabled={busy || !(inputs[t.id] ?? '').trim()}
                className="ta-btn"
                style={{ height: 30, paddingLeft: 10, paddingRight: 10, fontSize: 12 }}
              >
                추가
              </button>
            </div>
          </div>
        ))}
      </div>
      {error && <p className="text-[12px]" style={{ margin: 0, color: 'hsl(0 72% 45%)' }}>{error}</p>}
    </div>
  );
}
