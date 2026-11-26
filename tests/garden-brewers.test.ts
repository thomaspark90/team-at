import { describe, it, expect } from 'vitest';
import { brewerNames, cleanBrewerIds, effectiveBrewerIds, storeStaff, type BrewerStaffRow } from '@/lib/garden/brewers';

const rows: BrewerStaffRow[] = [
  { id: 1, name: '김소진', active: true, roles: ['barista'], home_store: 'yangjae', stores: ['yangjae'] },
  { id: 2, name: '김진영', active: true, roles: ['hot'], home_store: 'yangjae', stores: ['yangjae'] },
  { id: 3, name: '박연재', active: true, roles: ['barista'], home_store: 'pangyo', stores: ['pangyo', 'yangjae'] },
  { id: 4, name: '퇴사자', active: false, roles: ['barista'], home_store: 'yangjae', stores: ['yangjae'] },
  { id: 5, name: '김보영', active: true, roles: ['barista'], home_store: 'pangyo', stores: null },
];

describe('필터커피 내리는 사람', () => {
  it('후보는 그 지점에서 근무하는 재직자 — 근무 지점이 비어 있으면 기본 지점', () => {
    expect(storeStaff(rows, 'yangjae').map((r) => r.id)).toEqual([1, 2, 3]);
    expect(storeStaff(rows, 'pangyo').map((r) => r.id)).toEqual([3, 5]);
  });
  it('저장한 적이 없는 지점은 스케줄 역할 커피인 사람', () => {
    expect(effectiveBrewerIds(rows, {}, 'yangjae')).toEqual([1, 3]);
    expect(brewerNames(rows, {}, 'pangyo')).toEqual(['김보영', '박연재']);
  });
  it('저장한 뒤에는 역할과 무관하게 그 지점 목록만 — 다른 지점은 그대로', () => {
    const saved = { yangjae: [2] };
    expect(brewerNames(rows, saved, 'yangjae')).toEqual(['김진영']);
    expect(brewerNames(rows, saved, 'pangyo')).toEqual(['김보영', '박연재']);
  });
  it('두 지점에서 근무하는 사람은 지점마다 따로 켠다', () => {
    const saved = { yangjae: [1], pangyo: [3] };
    expect(brewerNames(rows, saved, 'yangjae')).toEqual(['김소진']);
    expect(brewerNames(rows, saved, 'pangyo')).toEqual(['박연재']);
  });
  it('빈 목록으로 저장하면 아무도 없다(역할로 되돌아가지 않는다)', () => {
    expect(brewerNames(rows, { yangjae: [] }, 'yangjae')).toEqual([]);
  });
  it('퇴사자 · 그 지점에서 근무하지 않는 사람은 저장돼 있어도 빠진다', () => {
    expect(brewerNames(rows, { yangjae: [1, 4, 5] }, 'yangjae')).toEqual(['김소진']);
  });
  it('저장할 id 정리 — 그 지점 재직자 · 정수 · 중복 제거', () => {
    expect(cleanBrewerIds([1, '2', 2, 4, 5, 99, 'x', 1.5], rows, 'yangjae')).toEqual([1, 2]);
    expect(cleanBrewerIds('1', rows, 'yangjae')).toEqual([]);
  });
});
