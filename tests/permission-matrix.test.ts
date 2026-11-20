import { describe, expect, it } from 'vitest';
import { buildMatrix, matrixColumns } from '@/lib/access/permission-matrix';
import { SECTION_KEYS } from '@/lib/access/sections';
import { GARDEN_TAB_KEYS } from '@/lib/garden/tabs';
import { STUDIO_TAB_KEYS } from '@/lib/studio/tabs';
import { GARDEN_TOPICS } from '@/lib/garden-notify-topics';

describe('권한 표 열 — 빠지는 권한이 없어야 한다', () => {
  const groups = buildMatrix();
  const cols = matrixColumns(groups);
  const keysOf = (type: string) => cols.flatMap((c) => (c.source.type === type && 'key' in c.source ? [c.source.key] : []));

  it('섹션·가든 탭·스탭밀 탭이 전부 한 번씩 들어간다', () => {
    expect(keysOf('sections').sort()).toEqual([...SECTION_KEYS].sort());
    expect(keysOf('tabs').sort()).toEqual([...GARDEN_TAB_KEYS].sort());
    expect(keysOf('studioTabs').sort()).toEqual([...STUDIO_TAB_KEYS].sort());
  });

  it("가든 화면 출입의 첫 열은 '홈'이다", () => {
    const garden = groups.find((g) => g.id === 'garden')!;
    expect(garden.subs[0].columns[0]).toMatchObject({ label: '홈', source: { type: 'tabs', key: 'dashboard' } });
  });

  it('내비에 없는 하위 화면은 상위 화면 옆에 붙는다', () => {
    const garden = groups.find((g) => g.id === 'garden')!;
    const sub = (key: string) => garden.subs.find((s) => s.columns.some((c) => c.source.type === 'tabs' && c.source.key === key))!;
    expect(sub('checklist_items')).toBe(sub('checklist'));
    expect(sub('nametags_manage')).toBe(sub('nametags'));
    expect(sub('words').label).toBe('기타');
  });

  it('알림 항목(토픽)이 전부 한 번씩 들어간다', () => {
    const ids = cols.flatMap((c) => (c.source.type === 'topic' ? [c.source.id] : []));
    expect(ids.sort()).toEqual(GARDEN_TOPICS.map((t) => t.id).sort());
  });

  it('열 id 는 겹치지 않는다', () => {
    expect(new Set(cols.map((c) => c.id)).size).toBe(cols.length);
  });
});
