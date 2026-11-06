import { honorific, rosterMatch, staffLabel } from '@/lib/staff/names';
import { describe, it, expect } from 'vitest';
import { effectiveActual, fmtSegment, hourlyStaff, hoursOf, laneOrder, roleCountsOf, leaveRemaining, needsActiveCheck, segmentError, substituteBalance, weekDays, weekStartOf } from '@/lib/schedule/time';
import { namesInCell, parseCsv, parseGrid, parseJoined, parseLeave, segmentsByName } from '@/lib/schedule/sheet-parse';
import type { Shift } from '@/lib/schedule/types';

const shift = (o: Partial<Shift>): Shift => ({
  id: 1, date: '2026-11-10', store: 'yangjae', staffId: 1, kind: 'plan', isOff: false, source: 'app', uncertain: false, start: 420, end: 960, ...o,
});

describe('주 계산 — 화요일 시작', () => {
  it('화요일은 자기 자신, 월요일은 6일 전 화요일', () => {
    expect(weekStartOf('2026-11-10')).toBe('2026-11-10'); // 화
    expect(weekStartOf('2026-11-16')).toBe('2026-11-10'); // 월
    expect(weekStartOf('2026-11-15')).toBe('2026-11-10'); // 일
    expect(weekDays('2026-11-10')[6]).toBe('2026-11-16');
  });
});

describe('근무 구간 검사', () => {
  it('겹침·역전·30분 단위 위반을 막는다', () => {
    expect(segmentError([{ start: 420, end: 960 }])).toBeNull();
    expect(segmentError([{ start: 420, end: 600 }, { start: 900, end: 960 }])).toBeNull();
    expect(segmentError([{ start: 420, end: 600 }, { start: 540, end: 960 }])).toMatch('겹칩');
    expect(segmentError([{ start: 960, end: 420 }])).toMatch('늦어야');
    expect(segmentError([{ start: 425, end: 960 }])).toMatch('30분');
  });
  it('표기', () => {
    expect(fmtSegment({ start: 420, end: 960 })).toBe('7–16');
    expect(fmtSegment({ start: 450, end: 960 })).toBe('7:30–16');
  });
});

describe('실제 근무 — 달라진 것만 기록', () => {
  const pub = () => true;
  it('실제 행이 없으면 계획 그대로', () => {
    const r = effectiveActual([shift({})], pub);
    expect(hoursOf(r)).toBe(9);
  });
  it('실제 행이 있으면 계획을 대체(조퇴)', () => {
    const r = effectiveActual([shift({}), shift({ id: 2, kind: 'actual', start: 420, end: 540 })], pub);
    expect(hoursOf(r)).toBe(2);
  });
  it('쉬었음 표시는 0시간', () => {
    const r = effectiveActual([shift({}), shift({ id: 2, kind: 'actual', isOff: true, start: undefined, end: undefined })], pub);
    expect(hoursOf(r)).toBe(0);
  });
  it('작성 중인 주의 계획은 근무로 치지 않는다', () => {
    expect(effectiveActual([shift({})], () => false)).toHaveLength(0);
  });
  it('다른 지점 실제 기록은 이 지점 계획을 대체하지 않는다', () => {
    const r = effectiveActual([shift({}), shift({ id: 2, kind: 'actual', store: 'pangyo', start: 600, end: 660 })], pub);
    expect(r).toHaveLength(2);
  });
});

describe('시간대별 인원', () => {
  it('30분 걸침도 세고 한 사람은 한 번만', () => {
    const r = hourlyStaff([shift({ start: 450, end: 540 }), shift({ id: 2, staffId: 2, start: 480, end: 540 })], 7, 10);
    expect(r).toEqual([[1], [1, 2], []]);
  });
});

describe('재직 확인 안내', () => {
  it('재직인데 30일 넘게 근무가 없으면 안내', () => {
    expect(needsActiveCheck(true, '2026-10-06', '2026-11-06')).toBe(true);
    expect(needsActiveCheck(true, '2026-10-07', '2026-11-06')).toBe(false);
  });
  it('퇴사 처리됐거나 기록이 없는 신규는 대상 아님', () => {
    expect(needsActiveCheck(false, '2026-01-01', '2026-11-06')).toBe(false);
    expect(needsActiveCheck(true, null, '2026-11-06')).toBe(false);
  });
});

describe('연차·대체 잔여', () => {
  it('기준일 이후 연차만 차감', () => {
    const rec = [{ type: 'annual', date: '2026-10-02' }, { type: 'annual', date: '2026-08-25' }, { type: 'sick', date: '2026-10-03' }];
    expect(leaveRemaining(9, '2026-10-01', rec)).toBe(8);
    expect(leaveRemaining(null, null, rec)).toBeNull();
  });
  it('대체 잔여', () => {
    expect(substituteBalance([{ type: 'sub_worked' }, { type: 'sub_worked' }, { type: 'sub_off' }])).toBe(1);
  });
});

describe('시트 해석', () => {
  it('따옴표·줄바꿈 셀', () => {
    expect(parseCsv('a,"b, c\nd",e\n')).toEqual([['a', 'b, c\nd', 'e']]);
  });
  it('이름 칸 — 줄바꿈 구분·별칭·중복', () => {
    expect(namesInCell('장나은, 배쉐프님,\n 모준혁, 장나은')).toEqual(['장나은', '배쉐프님', '모준혁']);
    expect(namesInCell('장나은, 승효')).toEqual(['장나은', '홍승효']);
  });
  it('칸을 근무 구간으로 잇고, 끊기면 둘로', () => {
    const cells = ['', '나은', '나은, 우아', '우아', '', '우아'];
    const m = segmentsByName(cells);
    expect(m.get('나은')).toEqual([{ start: 420, end: 540 }]);
    expect(m.get('우아')).toEqual([{ start: 480, end: 600 }, { start: 660, end: 720 }]);
  });
  it('근무표 행과 보조표', () => {
    const blank = Array(16).fill('');
    const cols = (memo: string, date: string, hours: string[], aux: string[] = []) =>
      [memo, date, ...hours, '', '', '', ...aux].map((c) => `"${c}"`).join(',');
    const csv = [
      '가든서비스',
      cols('메모', '2026. 05. 05 화', ['', '장나은', ...blank.slice(2)], ['5/5일', '모준혁', '7-6시', '1일', '']),
      cols('', '2026. 06. 03 수', blank, ['', '', '6/3일 7:00~19:00(12시간)', '']),
    ].join('\n');
    const g = parseGrid(csv);
    expect(g.days.map((d) => d.date)).toEqual(['2026-05-05', '2026-06-03']);
    expect(g.days[0].shifts.get('장나은')).toEqual([{ start: 420, end: 480 }]);
    expect(g.mayTable).toEqual(['5/5일 · 모준혁 · 7-6시 · 1일']);
    expect(g.juneTable).toEqual(['6/3일 7:00~19:00(12시간)']);
  });
  it('연차 탭', () => {
    expect(parseJoined('26년 5월 4일입사')).toBe('2026-05-04');
    const csv = ',25년 11월 5일 입사,26년 7월 21일 입사\n이름,아이카,진윤미\n총 연차,9개,\n사용 날짜,26.10.02(개인일정),\n남은 연차 갯수,8개,\n';
    const [a, b] = parseLeave(csv);
    expect(a).toEqual({ name: '아이카', joinedOn: '2025-11-05', total: 9, used: [{ date: '2026-10-02', note: '개인일정' }], remaining: 8 });
    expect(b.total).toBeNull();
  });
});

describe('직원 이름 표시', () => {
  const rows = [
    { name: '김소진', active: true },
    { name: '한승희', active: false },
    { name: '이지호', active: true },
    { name: '김지호', active: true },
    { name: '길형님', active: true },
  ];
  it('이름만 저장된 과거 기록을 명부 이름에 맞춘다', () => {
    expect(staffLabel('소진', rows)).toBe('김소진');
    expect(staffLabel('김소진', rows)).toBe('김소진');
  });
  it('퇴사자는 (퇴사) 표시', () => {
    expect(staffLabel('한승희', rows)).toBe('한승희(퇴사)');
    expect(staffLabel('승희', rows)).toBe('한승희(퇴사)');
  });
  it('후보가 둘이거나 없으면 원본 그대로', () => {
    expect(staffLabel('지호', rows)).toBe('지호');
    expect(staffLabel('홍길동', rows)).toBe('홍길동');
  });
  it('가입 신청 대조는 정확히 같은 이름만', () => {
    expect(rosterMatch('김소진', rows)).toBe('active');
    expect(rosterMatch('한승희', rows)).toBe('left');
    expect(rosterMatch('소진', rows)).toBe('none');
  });
  it('님 표기가 겹치지 않는다', () => {
    expect(honorific('김소진')).toBe('김소진님');
    expect(honorific('길형님')).toBe('길형님');
    expect(honorific('한승희(퇴사)')).toBe('한승희님(퇴사)');
  });
});

describe('역할별 인원', () => {
  it('두 역할을 가진 사람은 두 줄에 다 세고, 역할 없으면 미지정', () => {
    const rolesOf = new Map<number, string[]>([[1, ['barista', 'cold']], [2, ['pastry']], [3, ['gone']]]); // 'gone' 은 지워진 역할
    const r = roleCountsOf([1, 2, 3], rolesOf, ['bread', 'pastry', 'cold', 'hot', 'barista']);
    expect(r.barista).toEqual([1]);
    expect(r.cold).toEqual([1]);
    expect(r.pastry).toEqual([2]);
    expect(r.hot).toEqual([]);
    expect(r.none).toEqual([3]);
  });
});

describe('출근 순 줄 고정', () => {
  it('출근 시각 빠른 순, 같으면 이름순', () => {
    const list = [
      shift({ id: 1, staffId: 1, start: 600, end: 960 }),
      shift({ id: 2, staffId: 2, start: 420, end: 960 }),
      shift({ id: 3, staffId: 3, start: 420, end: 720 }),
      shift({ id: 4, staffId: 4, isOff: true, start: undefined, end: undefined }),
    ];
    const name = (id: number) => ({ 1: '김소진', 2: '진윤미', 3: '아이카', 4: '휴무' })[id] ?? '';
    expect(laneOrder(list, name)).toEqual([3, 2, 1]);
  });
});

import { streakEndingAt, weekWarnings } from '@/lib/schedule/warnings';
import { diffSnapshots, snapshotOf } from '@/lib/schedule/publish-diff';

describe('충돌 경고', () => {
  const days = weekDays('2026-11-10');
  it('하루 10시간 초과·주 52시간 초과', () => {
    const long = days.map((d, i) => shift({ id: i, date: d, start: 420, end: 420 + 11 * 60 })); // 11h × 7 = 77h
    const w = weekWarnings({ shifts: long, days, leaves: [], streakBefore: {} });
    expect(w.filter((x) => x.code === 'day')).toHaveLength(7);
    expect(w.find((x) => x.code === 'week')?.text).toBe('주 77시간');
  });
  it('연속 근무 — 주 시작 전 연속일을 이어서 센다', () => {
    const three = days.slice(0, 3).map((d, i) => shift({ id: i, date: d }));
    expect(weekWarnings({ shifts: three, days, leaves: [], streakBefore: {} }).some((x) => x.code === 'streak')).toBe(false);
    const w = weekWarnings({ shifts: three, days, leaves: [], streakBefore: { 1: 4 } });
    expect(w.filter((x) => x.code === 'streak').map((x) => x.date)).toEqual(['2026-11-11', '2026-11-12']);
    expect(streakEndingAt(new Set(['2026-11-09', '2026-11-08', '2026-11-06']), '2026-11-09')).toBe(2);
  });
  it('연차·불가일 배치와 두 지점 겹침', () => {
    const w = weekWarnings({
      shifts: [shift({ id: 1, date: '2026-11-10' }), shift({ id: 2, date: '2026-11-11', store: 'yangjae', start: 420, end: 720 }), shift({ id: 3, date: '2026-11-11', store: 'pangyo', start: 660, end: 960 })],
      days,
      leaves: [{ staffId: 1, date: '2026-11-10', type: 'unavailable' }, { staffId: 1, date: '2026-11-11', type: 'sub_worked' }],
      streakBefore: {},
    });
    expect(w.map((x) => [x.date, x.code])).toEqual([['2026-11-10', 'leave'], ['2026-11-11', 'overlap']]);
    expect(w[0].text).toBe('근무 불가인 날');
  });
});

describe('배포 비교', () => {
  it('추가·삭제·시간 변경만 남기고 분할 근무는 한 칸으로 본다', () => {
    const prev = snapshotOf([shift({ id: 1, date: '2026-11-10' }), shift({ id: 2, date: '2026-11-11' }), shift({ id: 3, date: '2026-11-12', start: 420, end: 600 }), shift({ id: 4, date: '2026-11-12', start: 900, end: 960 })]);
    const cur = snapshotOf([shift({ id: 1, date: '2026-11-10', start: 600, end: 1140 }), shift({ id: 3, date: '2026-11-12', start: 900, end: 960 }), shift({ id: 4, date: '2026-11-12', start: 420, end: 600 }), shift({ id: 5, date: '2026-11-13', staffId: 2 })]);
    expect(diffSnapshots(prev, cur)).toEqual([
      { staffId: 1, date: '2026-11-10', before: '7–16', after: '10–19' },
      { staffId: 1, date: '2026-11-11', before: '7–16', after: '' },
      { staffId: 2, date: '2026-11-13', before: '', after: '7–16' },
    ]);
    expect(diffSnapshots(null, [])).toEqual([]);
  });
});

import { addYears, fullMonthsBetween, statutoryLeave } from '@/lib/schedule/leave';

describe('연차 법정 발생(입사일 기준)', () => {
  it('만 개월 계산 — 같은 날짜에 도달해야 한 달', () => {
    expect(fullMonthsBetween('2026-09-22', '2026-11-06')).toBe(1);
    expect(fullMonthsBetween('2026-09-22', '2026-11-22')).toBe(2);
    expect(fullMonthsBetween('2026-11-10', '2026-11-06')).toBe(0);
  });
  it('1년 미만은 달마다 1개(최대 11), 기준일은 입사일', () => {
    expect(statutoryLeave('2026-09-22', '2026-11-06')).toMatchObject({ days: 1, asOf: '2026-09-22', basis: 'monthly', months: 1 });
    expect(statutoryLeave('2025-11-20', '2026-11-06')?.days).toBe(11);
    expect(statutoryLeave('2026-12-01', '2026-11-06')).toBeNull();
  });
  it('1년 이상은 15개, 3년차부터 2년마다 1개, 최대 25, 기준일은 기념일', () => {
    expect(statutoryLeave('2025-11-05', '2026-11-06')).toMatchObject({ days: 15, asOf: '2026-11-05', basis: 'annual', months: 12 });
    expect(statutoryLeave('2023-11-05', '2026-11-06')?.days).toBe(16); // 3년차
    expect(statutoryLeave('2021-11-05', '2026-11-06')?.days).toBe(17); // 5년차
    expect(statutoryLeave('2000-01-01', '2026-11-06')?.days).toBe(25);
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
  });
});

import { proratedDays } from '@/lib/schedule/leave';

describe('파트타임 연차 비례', () => {
  it('주 소정근로시간/40 비례, 0.5 단위 올림, 15시간 미만은 0, 40 이상·미입력은 그대로', () => {
    expect(proratedDays(15, 20)).toEqual({ days: 7.5, ratio: 0.5 });
    expect(proratedDays(15, 24)).toEqual({ days: 9, ratio: 0.6 });
    expect(proratedDays(11, 16)).toEqual({ days: 4.5, ratio: 0.4 });
    expect(proratedDays(15, 14)).toEqual({ days: 0, ratio: 0 });
    expect(proratedDays(15, 40).days).toBe(15);
    expect(proratedDays(15, null).days).toBe(15);
  });
  it('statutoryLeave 에 주 시간을 주면 비례된 개수와 통상 개수를 함께 준다', () => {
    const s = statutoryLeave('2025-11-05', '2026-11-06', 20)!;
    expect([s.days, s.fullDays, s.ratio]).toEqual([7.5, 15, 0.5]);
  });
});
