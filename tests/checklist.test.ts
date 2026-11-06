import { describe, it, expect } from 'vitest';
import { canTakeOver, overrideFromMembers, NO_OVERRIDE, pickLead, resolveCrew, type CrewPerson } from '@/lib/checklist/assignment';
import { assignmentsFor, groupBySection, isClosedDay, isEnabledStore, isMissed, itemsDue, photoCutoff, unfinishedItems } from '@/lib/checklist/logic';
import { insertAtSectionEnd, moveItem, moveSection, renameSection, renumber } from '@/lib/checklist/ordering';
import type { ChecklistItem } from '@/lib/checklist/types';
import type { Shift } from '@/lib/schedule/types';

const shift = (o: Partial<Shift>): Shift => ({
  id: 1, date: '2026-11-10', store: 'pangyo', staffId: 1, kind: 'plan', isOff: false, source: 'app', uncertain: false, start: 420, end: 960, ...o,
});
const item = (o: Partial<ChecklistItem>): ChecklistItem => ({
  id: 1, store: 'pangyo', shiftType: 'open', section: '커피', label: '항목', detail: '', frequency: 'daily', weekday: null,
  photoRequired: false, active: true, origin: 'sheet', sortOrder: 10, ...o,
});
const pub = () => true;

describe('근무표로 배정', () => {
  const day = [
    shift({ id: 1, staffId: 1, start: 420, end: 960 }), // 7–16 오픈
    shift({ id: 2, staffId: 2, start: 600, end: 960 }), // 10–16
    shift({ id: 3, staffId: 3, start: 600, end: 1140 }), // 10–19 마감
  ];
  it('가장 일찍 시작 = 오픈, 가장 늦게 끝남 = 마감', () => {
    expect(assignmentsFor(day, 'pangyo', '2026-11-10', pub)).toEqual({ open: [1], close: [3] });
  });
  it('같은 시각에 시작한 사람은 모두 오픈', () => {
    const r = assignmentsFor([...day, shift({ id: 4, staffId: 4, start: 420, end: 840 })], 'pangyo', '2026-11-10', pub);
    expect(r.open).toEqual([1, 4]);
  });
  it('혼자 근무하면 두 장 다', () => {
    expect(assignmentsFor([shift({})], 'pangyo', '2026-11-10', pub)).toEqual({ open: [1], close: [1] });
  });
  it('실제 근무가 계획을 이긴다 — 쉬기로 바뀐 오픈 인원에겐 안 준다', () => {
    const off = shift({ id: 9, staffId: 1, kind: 'actual', isOff: true, start: undefined, end: undefined });
    expect(assignmentsFor([...day, off], 'pangyo', '2026-11-10', pub).open).toEqual([2, 3]);
  });
  it('배포 전 계획이면 배정하지 않는다', () => {
    expect(assignmentsFor(day, 'pangyo', '2026-11-10', () => false)).toEqual({ open: [], close: [] });
  });
  it('다른 지점·다른 날은 섞지 않는다', () => {
    const r = assignmentsFor([...day, shift({ id: 5, staffId: 5, store: 'yangjae', start: 300 }), shift({ id: 6, staffId: 6, date: '2026-11-11', start: 300 })], 'pangyo', '2026-11-10', pub);
    expect(r.open).toEqual([1]);
  });
  it('분할 근무는 한 번만 센다', () => {
    const r = assignmentsFor([shift({ id: 1, start: 420, end: 600 }), shift({ id: 2, start: 840, end: 960 })], 'pangyo', '2026-11-10', pub);
    expect(r).toEqual({ open: [1], close: [1] });
  });
});

describe('정기 휴무', () => {
  it('양재 월요일만 휴무', () => {
    expect(isClosedDay('yangjae', '2026-11-09')).toBe(true); // 월
    expect(isClosedDay('yangjae', '2026-11-10')).toBe(false);
    expect(isClosedDay('pangyo', '2026-11-09')).toBe(false);
  });
});

describe('그날 항목', () => {
  const items = [
    item({ id: 1, label: '매일', sortOrder: 30 }),
    item({ id: 2, label: '화요일', frequency: 'weekly', weekday: 2, sortOrder: 20 }),
    item({ id: 3, label: '수요일', frequency: 'weekly', weekday: 3 }),
    item({ id: 4, label: '첫 화요일', frequency: 'monthly', weekday: 2, sortOrder: 10 }),
    item({ id: 5, label: '꺼짐', active: false }),
  ];
  it('첫째 주 화요일', () => {
    expect(itemsDue(items, '2026-11-03').map((i) => i.id)).toEqual([4, 2, 1]);
  });
  it('둘째 주 화요일엔 월간 항목이 빠진다', () => {
    expect(itemsDue(items, '2026-11-10').map((i) => i.id)).toEqual([2, 1]);
  });
  it('요일이 아니면 매일 항목만', () => {
    expect(itemsDue(items, '2026-11-13').map((i) => i.id)).toEqual([1]);
  });
});

describe('제출 판정', () => {
  const items = [item({ id: 1 }), item({ id: 2, photoRequired: true })];
  it('체크 없으면 막는다', () => {
    expect(unfinishedItems(items, [{ itemId: 1, status: 'done', hasPhoto: false }]).map((i) => i.id)).toEqual([2]);
  });
  it('사진 필수 항목은 사진 없이 완료로 칠 수 없다', () => {
    const r = unfinishedItems(items, [
      { itemId: 1, status: 'done', hasPhoto: false },
      { itemId: 2, status: 'done', hasPhoto: false },
    ]);
    expect(r.map((i) => i.id)).toEqual([2]);
  });
  it('사진이 있거나, 못 한 사유가 있으면 통과', () => {
    expect(unfinishedItems(items, [{ itemId: 1, status: 'skipped', hasPhoto: false }, { itemId: 2, status: 'done', hasPhoto: true }])).toEqual([]);
    expect(unfinishedItems(items, [{ itemId: 1, status: 'done', hasPhoto: false }, { itemId: 2, status: 'skipped', hasPhoto: false }])).toEqual([]);
  });
});

describe('구역 묶기', () => {
  it('순서를 유지해 이어 붙인다', () => {
    const g = groupBySection([{ section: 'A' }, { section: 'A' }, { section: 'B' }]);
    expect(g.map((x) => [x.section, x.items.length])).toEqual([['A', 2], ['B', 1]]);
  });
});

const person = (o: Partial<CrewPerson> & { id: number }): CrewPerson => ({ name: `직원${o.id}`, linked: true, dutyTag: null, joinedOn: null, ...o });

describe('책임자 자동 선정', () => {
  it('매니저 → 서브 매니저 → 태그 없음', () => {
    expect(pickLead([person({ id: 1 }), person({ id: 2, dutyTag: 'sub_manager' }), person({ id: 3, dutyTag: 'manager' })])).toBe(3);
    expect(pickLead([person({ id: 1 }), person({ id: 2, dutyTag: 'sub_manager' })])).toBe(2);
  });
  it('같은 등급이면 입사일 빠른 사람, 공란은 뒤로', () => {
    expect(pickLead([person({ id: 1 }), person({ id: 2, joinedOn: '2026-05-01' }), person({ id: 3, joinedOn: '2026-01-01' })])).toBe(3);
  });
  it('입사일도 없으면 이름 순', () => {
    expect(pickLead([person({ id: 1, name: '한지우' }), person({ id: 2, name: '김보영' })])).toBe(2);
  });
  it('계정이 없으면 매니저여도 뒤로 — 제출할 수 있는 사람이 책임자', () => {
    expect(pickLead([person({ id: 1, dutyTag: 'manager', linked: false }), person({ id: 2 })])).toBe(2);
  });
  it('아무도 없으면 없음', () => {
    expect(pickLead([])).toBeNull();
  });
});

describe('조 구성', () => {
  const people = new Map([1, 2, 3, 4].map((id) => [id, person({ id })]));
  it('수정이 없으면 자동 제안 그대로', () => {
    expect(resolveCrew([1, 2], NO_OVERRIDE, [], people)).toEqual({ memberIds: [1, 2], leadId: 1 });
  });
  it('운영진 추가·제외가 자동 제안을 이긴다', () => {
    const r = resolveCrew([1, 2], { added: [3], removed: [1], leadStaffId: null }, [], people);
    expect(r.memberIds).toEqual([2, 3]);
    expect(r.leadId).toBe(2);
  });
  it('지정 책임자가 우선, 조에서 빠지면 자동 선정으로', () => {
    expect(resolveCrew([1, 2], { ...NO_OVERRIDE, leadStaffId: 2 }, [], people).leadId).toBe(2);
    expect(resolveCrew([1, 2], { added: [], removed: [2], leadStaffId: 2 }, [], people).leadId).toBe(1);
  });
  it('대신 맡은 사람이 조에 합류한다', () => {
    expect(resolveCrew([], NO_OVERRIDE, [4], people)).toEqual({ memberIds: [4], leadId: 4 });
  });
  it('명부에 없는 id 는 무시한다', () => {
    expect(resolveCrew([9], NO_OVERRIDE, [], people)).toEqual({ memberIds: [], leadId: null });
  });
});

describe('조 수정값 만들기', () => {
  it('자동 제안과 같으면 추가·제외가 없다', () => {
    expect(overrideFromMembers([1, 2], [], [1, 2], null)).toEqual({ added: [], removed: [], leadStaffId: null });
  });
  it('뺀 사람은 제외, 넣은 사람은 추가, 대신 맡은 사람은 추가로 치지 않는다', () => {
    expect(overrideFromMembers([1, 2], [4], [2, 3, 4], 3)).toEqual({ added: [3], removed: [1], leadStaffId: 3 });
  });
  it('조에 없는 책임자 지정은 버린다', () => {
    expect(overrideFromMembers([1], [], [1], 9).leadStaffId).toBeNull();
  });
});

describe('대신 맡기 자격', () => {
  const staff = { active: true, stores: ['pangyo' as const] };
  it('소속 지점 직원, 계정에 지점이 지정된 직원, 운영진', () => {
    expect(canTakeOver({ editor: false, staff, stores: [] }, 'pangyo')).toBe(true);
    expect(canTakeOver({ editor: false, staff: { active: true, stores: ['yangjae', 'pangyo'] }, stores: [] }, 'pangyo')).toBe(true);
    expect(canTakeOver({ editor: false, staff: { active: true, stores: ['yangjae'] }, stores: ['pangyo'] }, 'pangyo')).toBe(true);
    expect(canTakeOver({ editor: true, staff: { active: true, stores: ['yangjae'] }, stores: [] }, 'pangyo')).toBe(true);
  });
  it('다른 지점 직원·퇴사자·명부 미연결은 안 된다', () => {
    expect(canTakeOver({ editor: false, staff, stores: [] }, 'yangjae')).toBe(false);
    expect(canTakeOver({ editor: false, staff: { active: false, stores: ['pangyo'] }, stores: [] }, 'pangyo')).toBe(false);
    expect(canTakeOver({ editor: true, staff: null, stores: [] }, 'pangyo')).toBe(false);
  });
});

describe('운영 범위와 미제출', () => {
  it('시범은 판교만', () => {
    expect(isEnabledStore('pangyo')).toBe(true);
    expect(isEnabledStore('yangjae')).toBe(false);
  });
  it('지난날 미제출만 미제출로 친다', () => {
    expect(isMissed('pangyo', '2026-11-10', '2026-11-11', null)).toBe(true);
    expect(isMissed('pangyo', '2026-11-11', '2026-11-11', null)).toBe(false);
    expect(isMissed('pangyo', '2026-11-10', '2026-11-11', '2026-11-10T10:00:00Z')).toBe(false);
  });
  it('운영 시작 전 날짜와 미운영 지점은 치지 않는다', () => {
    expect(isMissed('pangyo', '2026-11-09', '2026-11-11', null)).toBe(false);
    expect(isMissed('yangjae', '2026-11-10', '2026-11-11', null)).toBe(false);
  });
});

describe('사진 보관', () => {
  it('90일 전이 기준선이다', () => {
    expect(photoCutoff(new Date('2026-11-06T00:00:00Z'))).toBe('2026-08-08T00:00:00.000Z');
  });
});

describe('항목 순서', () => {
  const list = [
    { id: 1, section: 'A' },
    { id: 2, section: 'A' },
    { id: 3, section: 'B' },
    { id: 4, section: 'C' },
  ];
  const ids = (l: { id: number }[]) => l.map((i) => i.id);
  it('다른 항목 앞·뒤로 옮긴다', () => {
    expect(ids(moveItem(list, 1, { targetId: 2, place: 'after' }))).toEqual([2, 1, 3, 4]);
    expect(ids(moveItem(list, 4, { targetId: 1, place: 'before' }))).toEqual([4, 1, 2, 3]);
  });
  it('옮겨 간 자리의 구역을 따른다', () => {
    expect(moveItem(list, 1, { targetId: 3, place: 'after' }).find((i) => i.id === 1)?.section).toBe('B');
  });
  it('자기 자신이나 없는 대상이면 그대로', () => {
    expect(moveItem(list, 1, { targetId: 1, place: 'after' })).toBe(list);
    expect(moveItem(list, 1, { targetId: 9, place: 'after' })).toBe(list);
  });
  it('구역을 통째로 옮기고 끝에서는 그대로', () => {
    expect(ids(moveSection(list, 1, -1))).toEqual([3, 1, 2, 4]);
    expect(ids(moveSection(list, 0, 1))).toEqual([3, 1, 2, 4]);
    expect(moveSection(list, 0, -1)).toBe(list);
    expect(moveSection(list, 2, 1)).toBe(list);
  });
  it('구역 끝에 넣고, 없는 구역이면 맨 끝에', () => {
    expect(ids(insertAtSectionEnd(list, { id: 5, section: 'A' }))).toEqual([1, 2, 5, 3, 4]);
    expect(ids(insertAtSectionEnd(list, { id: 5, section: 'Z' }))).toEqual([1, 2, 3, 4, 5]);
  });
  it('구역 이름은 그 묶음만 바꾼다', () => {
    const split = [{ id: 1, section: 'A' }, { id: 2, section: 'B' }, { id: 3, section: 'A' }];
    expect(renameSection(split, 0, 'X').map((i) => i.section)).toEqual(['X', 'B', 'A']);
  });
  it('10 간격으로 번호를 매긴다', () => {
    expect(renumber(list).map((i) => i.sortOrder)).toEqual([10, 20, 30, 40]);
  });
});
