'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { TEACHING_CATEGORIES } from '@/lib/teaching/topics';
import { fmtMd, fmtRange } from '@/lib/teaching/kst';
import { STORES } from '@/lib/types';
import { api, type TeachingMe } from './types';
import TeachingPushToggle from './TeachingPushToggle';

// 스탭 위시리스트 — 배우고 싶은 주제를 체크하고, 자유 서술을 남긴다. 언제든 고칠 수 있다.
// 받은 주제는 '○/○ ○○ 매니저에게 받음'으로 바뀌고, 다시 원하면 재요청.

const storeLabel = (id: string) => STORES.find((s) => s.id === id)?.short ?? id;

export default function StaffWishlist({ me, onChange }: { me: TeachingMe; onChange: () => void }) {
  const initial = useMemo(() => new Set(me.wishes.map((w) => w.topicKey)), [me.wishes]);
  const [selected, setSelected] = useState<Set<string>>(initial);
  const [rerequest, setRerequest] = useState<Set<string>>(new Set());
  const [note, setNote] = useState(me.note);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const receivedOf = (key: string) => me.wishes.find((w) => w.topicKey === key)?.received ?? null;
  const lastReceivedOf = (key: string) => me.receivedAll.find((r) => r.topicKey === key) ?? null;

  const dirty =
    note !== me.note ||
    rerequest.size > 0 ||
    selected.size !== initial.size ||
    Array.from(selected).some((k) => !initial.has(k));

  const toggle = (key: string) => {
    setSaved(false);
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) {
        n.delete(key);
        setRerequest((r) => {
          const nr = new Set(r);
          nr.delete(key);
          return nr;
        });
      } else n.add(key);
      return n;
    });
  };
  const askAgain = (key: string) => {
    setSaved(false);
    setSelected((s) => new Set(s).add(key));
    setRerequest((r) => new Set(r).add(key));
  };

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api('/api/garden-teaching/wishes', {
        method: 'PUT',
        body: JSON.stringify({ topics: Array.from(selected), note, rerequest: Array.from(rerequest) }),
      });
      setRerequest(new Set());
      setSaved(true);
      onChange();
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const openCount = Array.from(selected).filter((k) => !receivedOf(k) || rerequest.has(k)).length;

  return (
    <div className="space-y-12">
      <div>
        <h1 className="text-[22px] font-medium">교육</h1>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {me.profile?.name}님, 매니저에게 배우고 싶은 걸 골라두세요. 매니저가 출근하는 날 이 목록을 보고 준비합니다.
        </p>
      </div>

      <section className="space-y-3">
        <span className="ta-label">매니저 출근 예정</span>
        {me.shifts.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">아직 등록된 일정이 없어요.</p>
        ) : (
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
            {me.shifts.slice(0, 8).map((s) => {
              const mine = s.trainees.some((t) => t.userId === me.userId);
              return (
                <li key={s.id} className="tabular">
                  <span className={s.date === me.today ? 'text-emerald-600' : ''}>{fmtMd(s.date)}</span>{' '}
                  {fmtRange(s.startTime, s.endTime) && <span>{fmtRange(s.startTime, s.endTime)} </span>}
                  <span className="text-muted-foreground">{storeLabel(s.store)}</span> {s.managerName}
                  {mine && <span className="ml-1 text-[11px] text-emerald-600">내 교육</span>}
                </li>
              );
            })}
          </ul>
        )}
        <TeachingPushToggle />
      </section>

      <section className="space-y-8">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px]">배우고 싶은 주제</h2>
          <span className="text-[11px] text-muted-foreground tabular">요청 중 {openCount}개</span>
        </div>
        <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
          {TEACHING_CATEGORIES.map((cat) => (
            <div key={cat.key} className="space-y-3">
              <span className="ta-label">{cat.label}</span>
              <ul className="space-y-2">
                {cat.topics
                  .filter((t) => !t.retired || selected.has(t.key))
                  .map((t) => {
                    const on = selected.has(t.key);
                    const rec = receivedOf(t.key);
                    const last = lastReceivedOf(t.key);
                    const again = rerequest.has(t.key);
                    return (
                      <li key={t.key} className="flex flex-wrap items-start gap-x-3 gap-y-1">
                        <label className="flex cursor-pointer items-center gap-2 text-[13px]">
                          <input type="checkbox" className="h-4 w-4 accent-[hsl(var(--foreground))]" checked={on} onChange={() => toggle(t.key)} />
                          <span className={on ? '' : 'text-muted-foreground'}>{t.label}</span>
                        </label>
                        {on && rec && !again && (
                          <span className="text-[11px] text-emerald-600">
                            {fmtMd(rec.date)} {rec.managerName}에게 받음 ·{' '}
                            <button className="underline underline-offset-2" onClick={() => askAgain(t.key)}>다시 요청</button>
                          </span>
                        )}
                        {on && again && <span className="text-[11px] text-amber-600">다시 요청 (저장하면 반영)</span>}
                        {!on && last && <span className="text-[11px] text-muted-foreground">{fmtMd(last.date)} 받음</span>}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <label className="block">
          <span className="ta-label">이런 것도 배우고 싶어요</span>
          <textarea
            className="ta-input h-24 w-full py-2"
            value={note}
            onChange={(e) => {
              setSaved(false);
              setNote(e.target.value);
            }}
            maxLength={500}
            placeholder="목록에 없는 주제, 요즘 막히는 것, 궁금한 것 — 자유롭게"
          />
        </label>
      </section>

      <div className="flex flex-wrap items-center gap-4">
        <button className="ta-btn-primary" disabled={busy || !dirty} onClick={save}>
          {busy ? '저장 중…' : '저장'}
        </button>
        {saved && !dirty && <span className="text-[13px] text-emerald-600">저장했어요</span>}
        {error && <span className="ta-error text-[13px]">{error}</span>}
        {me.profile?.simpleLogin && (
          <Link href="/account/pin" className="ml-auto text-[11px] text-muted-foreground underline underline-offset-2">
            비밀번호 변경
          </Link>
        )}
      </div>
    </div>
  );
}
