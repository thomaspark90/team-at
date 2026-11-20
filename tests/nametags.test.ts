import { describe, expect, it } from 'vitest';
import { buildNametagJsx } from '@/lib/garden/nametag-jsx';
import { buildDraftPrompt, cleanDraft } from '@/lib/garden/nametag-draft';
import { NAMETAG_SEED } from '@/lib/garden/nametag-seed';
import { cleanPhone, contactName, deliveryText, expandLines, groupByCategory, sanitizeItem, sheetCount, type NametagLine } from '@/lib/garden/nametags';
import { GARDEN_TABS, tabForPath } from '@/lib/garden/tabs';

const line = (ko: string, qty: number): NametagLine => ({ itemId: ko, kind: 'menu', ko, en: 'En', desc: '설명', qty });

describe('네임택 초기 메뉴', () => {
  it('id 가 겹치지 않고 모든 메뉴가 등록된 카테고리에 속한다', () => {
    const ids = NAMETAG_SEED.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    const cats = new Set(NAMETAG_SEED.categories.map((c) => c.id));
    expect(NAMETAG_SEED.items.every((i) => cats.has(i.category))).toBe(true);
  });

  it('같은 이름의 메뉴가 두 번 들어 있지 않다 (원본 .ai 의 중복 정리)', () => {
    const names = NAMETAG_SEED.items.map((i) => i.ko);
    expect(new Set(names).size).toBe(names.length);
  });

  it('카테고리별로 묶으면 빠지는 메뉴가 없다', () => {
    const total = groupByCategory(NAMETAG_SEED).reduce((n, g) => n + g.items.length, 0);
    expect(total).toBe(NAMETAG_SEED.items.length);
  });
});

describe('요청 → 인쇄 칸', () => {
  it('수량만큼 칸이 늘고 A4 한 장은 10칸', () => {
    const tags = expandLines([line('스프', 1), line('후무스', 3)]);
    expect(tags.map((t) => t.ko)).toEqual(['스프', '후무스', '후무스', '후무스']);
    expect(sheetCount(10)).toBe(1);
    expect(sheetCount(11)).toBe(2);
  });
});

describe('sanitizeItem', () => {
  it('이름이 비면 오류 문구', () => {
    expect(typeof sanitizeItem({ ko: '  ' })).toBe('string');
  });
  it('설명은 세 줄까지, 빈 줄·앞뒤 공백 제거', () => {
    const r = sanitizeItem({ ko: '요거트 토핑', en: ' Yogurt Toppings ', desc: ' a \n\n b\nc\nd' });
    expect(r).toEqual({ kind: 'menu', ko: '요거트 토핑', en: 'Yogurt Toppings', desc: 'a\nb\nc' });
  });
  it('큰 안내는 한글 두 줄만 남긴다', () => {
    const r = sanitizeItem({ kind: 'big', ko: '보울 메뉴는 카운터에서\n용기를 드려요', en: 'x', desc: 'y' });
    expect(r).toEqual({ kind: 'big', ko: '보울 메뉴는 카운터에서\n용기를 드려요', en: '', desc: '' });
  });
});

describe('buildNametagJsx', () => {
  const jsx = buildNametagJsx(expandLines([line('크리미 로제 소스', 2)]).map((t) => ({ ...t, en: 'Creamy Rosé Sauce', desc: '첫 줄\n둘째 줄 $& `x`' })));

  it('순수 ASCII 로 내보낸다 (일러스트가 파일 인코딩을 오판해도 한글이 깨지지 않게)', () => {
    expect(/^[\x00-\x7f]*$/.test(jsx)).toBe(true);
  });

  it('데이터가 그대로 실린다 — 스크립트 안의 배열을 평가하면 원문이 나온다', () => {
    const m = jsx.match(/var TAGS = (\[.*\]);/);
    expect(m).not.toBeNull();
    const tags = JSON.parse(m![1]);
    expect(tags).toHaveLength(2);
    expect(tags[0]).toEqual({ k: 'menu', ko: '크리미 로제 소스', en: 'Creamy Rosé Sauce', desc: '첫 줄\n둘째 줄 $& `x`' });
  });

  it('문법 오류 없는 스크립트다', () => {
    expect(() => new Function(jsx)).not.toThrow();
  });
});

describe('네임택 탭 등록', () => {
  it('관리 화면은 관리 탭으로, 요청 화면은 네임택 탭으로 판정된다', () => {
    expect(GARDEN_TABS.some((t) => t.key === 'nametags')).toBe(true);
    expect(tabForPath('/garden/nametags')?.key).toBe('nametags');
    expect(tabForPath('/garden/nametags/manage')?.key).toBe('nametags_manage');
  });
});

describe('담당자 표시 · 수령 안내', () => {
  it('이름이 비면 이메일 앞부분을 보여준다', () => {
    expect(contactName({ email: 'graphic@team.at', name: '' })).toBe('graphic');
    expect(contactName({ email: 'graphic@team.at', name: '홍길동' })).toBe('홍길동');
  });
  it('전화번호는 숫자·하이픈·+ 만 남긴다', () => {
    expect(cleanPhone(' 010-1234-5678 (그래픽)<b>')).toBe('010-1234-5678');
  });
  it('직접 전달이면 인쇄한 사람 이름을 넣는다', () => {
    const c = { email: 'graphic@team.at', name: '홍길동', phone: '010-1234-5678' };
    expect(deliveryText({ delivery: 'direct', doneBy: c.email, doneByContact: c, deliveryNote: '3시쯤' })).toBe('홍길동님이 직접 전달합니다 · 3시쯤');
    expect(deliveryText({ delivery: 'other', doneBy: c.email, doneByContact: c, deliveryNote: '김매니저님 편에 보냈어요' })).toBe('다른 분이 전달합니다 · 김매니저님 편에 보냈어요');
  });
});

describe('네임택 문구 초안', () => {
  it('지시문에 메뉴 이름과 카테고리 id·기존 예시가 들어간다', () => {
    const p = buildDraftPrompt('감자 뇨끼', NAMETAG_SEED);
    expect(p).toContain('한글 메뉴 이름: 감자 뇨끼');
    expect(p).toContain('[soup]');
    expect(p).not.toContain('[notice]'); // 안내 택은 메뉴 예시가 아니다
  });
  it('응답을 다듬는다 — 줄 수 제한, 없는 카테고리는 버림', () => {
    const d = cleanDraft({ en: '  Potato   Gnocchi ', desc: 'a\n\nb\nc\nd', category: 'nope' }, NAMETAG_SEED);
    expect(d).toEqual({ en: 'Potato Gnocchi', desc: 'a\nb\nc', category: null });
    expect(cleanDraft({ category: 'rice' }, NAMETAG_SEED).category).toBe('rice');
    expect(cleanDraft(null, NAMETAG_SEED)).toEqual({ en: '', desc: '', category: null });
  });
});
