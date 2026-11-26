import { describe, it, expect } from 'vitest';
import { brewerNames, cleanBrewerIds, effectiveBrewerIds, type BrewerStaffRow } from '@/lib/garden/brewers';

const rows: BrewerStaffRow[] = [
  { id: 1, name: '김소진', active: true, roles: ['barista'] },
  { id: 2, name: '김진영', active: true, roles: ['hot'] },
  { id: 3, name: '박연재', active: true, roles: ['barista'] },
  { id: 4, name: '퇴사자', active: false, roles: ['barista'] },
];

describe('필터커피 내리는 사람', () => {
  it('설정에서 저장한 적이 없으면 스케줄 역할 커피인 재직자', () => {
    expect(effectiveBrewerIds(rows, null)).toEqual([1, 3]);
    expect(brewerNames(rows, null)).toEqual(['김소진', '박연재']);
  });
  it('저장한 뒤에는 역할과 무관하게 그 목록만', () => {
    expect(brewerNames(rows, [2])).toEqual(['김진영']);
  });
  it('빈 목록으로 저장하면 아무도 없다(역할로 되돌아가지 않는다)', () => {
    expect(brewerNames(rows, [])).toEqual([]);
  });
  it('퇴사자는 저장돼 있어도 빠진다', () => {
    expect(brewerNames(rows, [1, 4])).toEqual(['김소진']);
  });
  it('저장할 id 정리 — 재직자 · 정수 · 중복 제거', () => {
    expect(cleanBrewerIds([1, '2', 2, 4, 99, 'x', 1.5], rows)).toEqual([1, 2]);
    expect(cleanBrewerIds('1', rows)).toEqual([]);
  });
});
