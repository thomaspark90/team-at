'use client';

import { fmtMd, fmtRange } from '@/lib/teaching/kst';
import { topicLabel } from '@/lib/teaching/topics';
import { STORES } from '@/lib/types';
import type { Shift } from './types';

// 티칭 일정 타임라인 — 일정 하나가 한 행, 06:00~20:00 가로 축 위에 시작~종료만큼 막대.
//  · 룩은 thomasinpark-contract GanttChart 카드 레인(위 얇은 선 + 양끝 점 + 아래로 흐려지는 면)을 시간 축으로 옮긴 것.
//  · 막대 안: 시간 · 티칭 스태프 → 교육 대상, 그 아래 대상이 아직 못 받은 요청 주제(뭘 준비할지).
//  · 시간을 안 넣은 일정은 전체 폭 흐린 막대 + '시간 미정'. 시작만 있으면 시작~20:00.
//  · 축 밖 시간(05:30, 21:00 등)은 축 끝에 붙여 그린다.
//  · 장식색 없음(DESIGN_SYSTEM §1) — 막대는 muted 면, 오늘 날짜만 emerald.

const AXIS_START = 6;
const AXIS_END = 20;
const HOURS = Array.from({ length: AXIS_END - AXIS_START + 1 }, (_, i) => AXIS_START + i);
const LABEL_EVERY = 2;

const toHours = (t: string | null | undefined) => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h + (m || 0) / 60;
};
const pct = (h: number) => (Math.min(AXIS_END, Math.max(AXIS_START, h)) - AXIS_START) / (AXIS_END - AXIS_START) * 100;

const storeShort = (id: string) => STORES.find((s) => s.id === id)?.short ?? id;

export default function ShiftTimeline({
  shifts,
  today,
  isAdmin,
  onRemove,
}: {
  shifts: Shift[];
  today: string;
  isAdmin: boolean;
  onRemove?: (id: number) => void;
}) {
  if (shifts.length === 0) return null;
  // Tailwind JIT는 소스에 통째로 적힌 클래스만 만든다 — 조합 문자열 금지
  const cols = isAdmin ? 'grid-cols-[96px_minmax(0,1fr)_44px]' : 'grid-cols-[96px_minmax(0,1fr)]';

  return (
    <div>
      {/* 시간 축 헤더 */}
      <div className={`grid ${cols} border-b border-border pb-2`}>
        <span />
        <div className="relative h-4">
          {HOURS.filter((h) => (h - AXIS_START) % LABEL_EVERY === 0).map((h) => (
            <span
              key={h}
              className="absolute top-0 -translate-x-1/2 text-caption tabular text-muted-foreground"
              style={{ left: `${pct(h)}%` }}
            >
              {String(h).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        {isAdmin && <span />}
      </div>

      {/* 일정 행 */}
      <ul className="divide-y divide-dashed divide-border">
        {shifts.map((s) => {
          const start = toHours(s.startTime);
          const end = toHours(s.endTime);
          const undecided = start === null && end === null;
          const left = start === null ? 0 : pct(start);
          const right = end === null ? 100 : pct(end);
          const width = Math.max(right - left, 0.5);
          const isToday = s.date === today;
          const names = s.trainees.map((t) => t.name).join(', ');
          const topics = Array.from(new Set(s.trainees.flatMap((t) => t.openTopics))).map(topicLabel);

          return (
            <li key={s.id} className={`grid ${cols} py-3`}>
              {/* 날짜 · 지점 */}
              <div className="pr-3 text-body">
                <p className={`tabular ${isToday ? 'text-emerald-600' : ''}`}>{fmtMd(s.date)}</p>
                <p className="text-caption text-muted-foreground">{storeShort(s.store)}</p>
              </div>

              {/* 축 + 막대 */}
              <div className="relative min-h-[52px]">
                {HOURS.map((h) => (
                  <span
                    key={h}
                    className="pointer-events-none absolute inset-y-0 border-l border-border/60"
                    style={{ left: `${pct(h)}%` }}
                  />
                ))}
                <div
                  className={`absolute top-1 ${undecided ? 'opacity-50' : ''}`}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={[fmtMd(s.date), fmtRange(s.startTime, s.endTime) || '시간 미정', storeShort(s.store), s.managerName, names]
                    .filter(Boolean)
                    .join(' · ')}
                >
                  <div className="relative h-0.5 bg-foreground">
                    {start !== null && <span className="absolute -left-px -top-[3px] h-2 w-2 rounded-full bg-foreground" />}
                    {end !== null && <span className="absolute -right-px -top-[3px] h-2 w-2 rounded-full bg-foreground" />}
                  </div>
                  <div className="whitespace-nowrap bg-gradient-to-b from-muted/90 to-transparent px-2 pb-2 pt-1.5 text-body">
                    <p>
                      <span className="tabular">{undecided ? '시간 미정' : fmtRange(s.startTime, s.endTime)}</span>
                      {isAdmin && <span className="text-muted-foreground"> · {s.managerName}</span>}
                      <span className="text-muted-foreground"> → {names || '지점 스탭 전원'}</span>
                    </p>
                    {topics.length > 0 && (
                      <p className="mt-0.5 text-caption text-muted-foreground">{topics.join(' · ')}</p>
                    )}
                  </div>
                </div>
              </div>

              {isAdmin && onRemove && (
                <div className="flex items-start justify-end">
                  <button
                    className="text-caption text-muted-foreground underline underline-offset-2"
                    onClick={() => onRemove(s.id)}
                  >
                    삭제
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
