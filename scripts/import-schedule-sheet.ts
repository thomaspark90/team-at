// 구글 시트 '양재천점 근무 스케줄' → finance.schedule_* 이관 SQL 생성. DB 에 직접 쓰지 않는다.
//
//   npx tsx scripts/import-schedule-sheet.ts --grid 근무표.csv --leave 연차.csv --through 2026-11-01 [--from 2026-11-02] [--sql out.sql]
//   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f out.sql
//
// --sql 없으면 드라이런(요약 리포트만). 다시 돌려도 안전하다:
//   · 시트 이관분(source='sheet')만 갈아 끼우고, 앱에서 고친 사람·날짜(source='app')는 건드리지 않는다.
//   · 명부·연차 총개수는 이미 있으면 덮어쓰지 않는다(앱 수정 보존).
//   · 재이관은 --from 으로 새 날짜만 지정한다. 앱에서 지운 지난 기록이 되살아나지 않게.
// 시트에 적힌 것은 전부 '실제'로 넣는다 — 계획/실제가 시트에서 구분되지 않기 때문(2026-11-06 대표 결정).
import { readFileSync, writeFileSync } from 'node:fs';
import { parseGrid, parseLeave } from '../lib/schedule/sheet-parse';

const arg = (k: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i > 0 ? process.argv[i + 1] : undefined;
};
const gridPath = arg('grid');
const leavePath = arg('leave');
const through = arg('through');
if (!gridPath || !leavePath || !through) {
  console.error('사용법: --grid <csv> --leave <csv> --through YYYY-MM-DD [--sql out.sql]');
  process.exit(1);
}

const STORE = 'yangjae';
const PANGYO_HOME = new Set(['김보영', '한지우', '이진희', '박연재']); // 판교 소속(교육 명부·프로필 기준)
const ACTIVE_SINCE = '2026-10-01'; // 이후 근무가 있으면 재직으로 본다
const LEAVE_AS_OF = '2026-10-01'; // 연차 탭 '총 연차 갯수(26.10.01 기준)'
// 시트 메모가 밝힌 부정확 구간
const isUncertain = (name: string, date: string) =>
  (name === '이우아' && date >= '2026-07-23') || // "*우아님 모든 스케줄은 임의로 작성됨(실제 근무시간과 상이함)"
  (date >= '2026-05-24' && date <= '2026-05-31'); // "정확한 스케줄 확인 필요"

const grid = parseGrid(readFileSync(gridPath, 'utf8'));
const leave = parseLeave(readFileSync(leavePath, 'utf8'));
const from = arg('from') ?? '0000-00-00';
const days = grid.days.filter((d) => d.date >= from && d.date <= through);
const firstDate = days[0].date;

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
type Row = { date: string; name: string; start: number; end: number };
const rows: Row[] = days.flatMap((d) =>
  Array.from(d.shifts).flatMap(([name, segs]) => segs.map((s) => ({ date: d.date, name, ...s }))),
);

// 명부
const lastWorked = new Map<string, string>();
for (const r of rows) if ((lastWorked.get(r.name) ?? '') < r.date) lastWorked.set(r.name, r.date);
const leaveByName = new Map(leave.map((l) => [l.name, l]));
const names = Array.from(new Set([...Array.from(lastWorked.keys()), ...leave.map((l) => l.name)])).sort((a, b) => a.localeCompare(b, 'ko'));

// 날짜 메모 — A열 원문 + 보조표 원문(근무표와 안 맞는 항목이 있어 해석하지 않고 그대로)
const notes = new Map<string, string>();
for (const d of days) if (d.memo) notes.set(d.date, d.memo);
const addNote = (date: string, title: string, lines: string[]) => {
  if (!lines.length || date < from || date > through) return;
  notes.set(date, [notes.get(date), `[시트 보조표: ${title}]`, ...lines].filter(Boolean).join('\n'));
};
addNote('2026-05-05', '5월 단기 인력', grid.mayTable);
addNote('2026-06-01', '6월 시간표', grid.juneTable);

// ── 리포트 ──
const hours = (rs: Row[]) => rs.reduce((n, r) => n + (r.end - r.start) / 60, 0);
console.log(`기간 ${firstDate} ~ ${days[days.length - 1].date} (${days.length}일) · 구간 ${rows.length}건 · 총 ${hours(rows)}시간(휴게 포함)`);
console.log(`명부 ${names.length}명 · 메모 ${notes.size}건 · 시트 범위 밖(--through 이후) ${grid.days.length - days.length}일 제외`);

const months = Array.from(new Set(days.map((d) => d.date.slice(0, 7))));
console.log(`\n사람별 월 근무시간(휴게 포함)\n이름\t${months.map((m) => m.slice(5)).join('\t')}\t합계\t마지막\t지점\t재직`);
for (const n of names) {
  const mine = rows.filter((r) => r.name === n);
  const active = (lastWorked.get(n) ?? '') >= ACTIVE_SINCE || leaveByName.has(n);
  console.log([n, ...months.map((m) => hours(mine.filter((r) => r.date.startsWith(m))) || '·'), hours(mine), (lastWorked.get(n) ?? '-').slice(5), PANGYO_HOME.has(n) ? '판교' : '양재', active ? 'O' : ''].join('\t'));
}

console.log('\n하루가 끊겨 보이는 근무(분할근무 또는 입력 오류 — 그대로 옮김)');
for (const d of days) for (const [n, segs] of Array.from(d.shifts)) if (segs.length > 1) console.log(`  ${d.date} ${n}: ${segs.map((s) => `${s.start / 60}-${s.end / 60}`).join(', ')}`);

console.log('\n1시간 근무(칸 하나만 채운 행)');
for (const d of days) for (const [n, segs] of Array.from(d.shifts)) if (segs.length === 1 && segs[0].end - segs[0].start === 60) console.log(`  ${d.date} ${n}: ${segs[0].start / 60}시`);

console.log('\n연차');
for (const l of leave) {
  const calc = l.total == null ? null : l.total - l.used.length;
  const flag = calc !== l.remaining ? ' ⚠ 시트 잔여와 다름' : '';
  console.log(`  ${l.name} 입사 ${l.joinedOn ?? '-'} 총 ${l.total ?? '-'} 사용 ${l.used.map((u) => u.date).join(',') || '-'} 잔여 ${calc ?? '-'}${flag}`);
}

// ── SQL ──
const sqlPath = arg('sql');
if (sqlPath) {
  const sql: string[] = ['begin;'];
  sql.push(
    `insert into finance.schedule_staff (name, home_store, joined_on, active) values\n` +
      names
        .map((n) => {
          const active = (lastWorked.get(n) ?? '') >= ACTIVE_SINCE || leaveByName.has(n);
          const joined = leaveByName.get(n)?.joinedOn;
          return `  (${q(n)}, ${q(PANGYO_HOME.has(n) ? 'pangyo' : STORE)}, ${joined ? `${q(joined)}::date` : 'null::date'}, ${active})`;
        })
        .join(',\n') +
      `\non conflict (name) do nothing;`,
  );
  sql.push(`delete from finance.schedule_shifts where store=${q(STORE)} and kind='actual' and source='sheet' and work_date between ${q(firstDate)} and ${q(through)};`);
  sql.push(
    `insert into finance.schedule_shifts (work_date, store, staff_id, kind, start_min, end_min, source, uncertain, updated_by)\n` +
      `select v.d::date, ${q(STORE)}, s.id, 'actual', v.a, v.b, 'sheet', v.u, 'sheet-import'\nfrom (values\n` +
      rows.map((r) => `  (${q(r.date)}, ${q(r.name)}, ${r.start}, ${r.end}, ${isUncertain(r.name, r.date)})`).join(',\n') +
      `\n) as v(d, n, a, b, u)\njoin finance.schedule_staff s on s.name = v.n\n` +
      `where not exists (select 1 from finance.schedule_shifts x where x.work_date = v.d::date and x.store = ${q(STORE)} and x.staff_id = s.id and x.kind = 'actual' and x.source = 'app');`,
  );
  if (notes.size) sql.push(
    `insert into finance.schedule_day_notes (store, work_date, note, source) values\n` +
      Array.from(notes).map(([d, n]) => `  (${q(STORE)}, ${q(d)}, ${q(n)}, 'sheet')`).join(',\n') +
      `\non conflict (store, work_date) do update set note = excluded.note, updated_at = now() where finance.schedule_day_notes.source = 'sheet';`,
  );
  const withTotal = leave.filter((l) => l.total != null);
  if (withTotal.length) {
    sql.push(
      `insert into finance.leave_balances (staff_id, total_days, as_of)\nselect s.id, v.t, ${q(LEAVE_AS_OF)}::date from (values\n` +
        withTotal.map((l) => `  (${q(l.name)}, ${l.total}::numeric)`).join(',\n') +
        `\n) as v(n, t) join finance.schedule_staff s on s.name = v.n\non conflict (staff_id) do nothing;`,
    );
  }
  const used = leave.flatMap((l) => l.used.map((u) => ({ name: l.name, ...u })));
  if (used.length) {
    sql.push(
      `insert into finance.leave_records (staff_id, leave_date, type, note, source)\nselect s.id, v.d::date, 'annual', v.m, 'sheet' from (values\n` +
        used.map((u) => `  (${q(u.name)}, ${q(u.date)}, ${q(u.note)})`).join(',\n') +
        `\n) as v(n, d, m) join finance.schedule_staff s on s.name = v.n\non conflict (staff_id, leave_date, type) do nothing;`,
    );
  }
  sql.push('commit;');
  writeFileSync(sqlPath, sql.join('\n\n') + '\n');
  console.log(`\nSQL 작성: ${sqlPath}`);
}
