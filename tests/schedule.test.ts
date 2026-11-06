import { honorific, rosterMatch, staffLabel } from '@/lib/staff/names';
import { describe, it, expect } from 'vitest';
import { effectiveActual, fmtSegment, hourlyStaff, hoursOf, roleCountsOf, leaveRemaining, needsActiveCheck, segmentError, substituteBalance, weekDays, weekStartOf } from '@/lib/schedule/time';
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
    const rolesOf = new Map<number, ('barista' | 'cold' | 'pastry' | 'hot' | 'dish')[]>([[1, ['barista', 'cold']], [2, ['pastry']], [3, []]]);
    const r = roleCountsOf([1, 2, 3], rolesOf);
    expect(r.barista).toEqual([1]);
    expect(r.cold).toEqual([1]);
    expect(r.pastry).toEqual([2]);
    expect(r.hot).toEqual([]);
    expect(r.none).toEqual([3]);
  });
});
