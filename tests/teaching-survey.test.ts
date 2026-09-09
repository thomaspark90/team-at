import { describe, it, expect } from 'vitest';
import { parseTallyPayload, topicKeyFromLabel, storeForForm } from '@/lib/teaching/survey-parse';

// 탈리 웹훅 → 설문 응답 정규화 고정. 폼 라벨·옵션 문구가 바뀌면 여기가 먼저 깨진다(=반영 파이프라인 점검 신호).

const payload = {
  eventId: 'evt-1',
  eventType: 'FORM_RESPONSE',
  createdAt: '2026-09-09T07:27:00.000Z',
  data: {
    responseId: 'resp-1',
    submissionId: 'sub-1',
    formId: 'Bzy5WQ',
    formName: '티칭 매니저에게 배우고 싶은 것 — 판교점 설문',
    createdAt: '2026-09-09T07:27:00.000Z',
    fields: [
      { key: 'q_name', label: '이름', type: 'INPUT_TEXT', value: ' 한지우 ' },
      {
        key: 'q_topics',
        label: '1. 배우고 싶은 주제를 모두 골라주세요 (여러 개 가능)',
        type: 'CHECKBOXES',
        value: ['o1', 'o2', 'o_other'],
        options: [
          { id: 'o1', text: '[추출] 물 온도·추출 변수, 맛이 왜 달라지나' },
          { id: 'o2', text: '[우유] 라떼아트 (하트·로제타)' },
          { id: 'o_other', text: '직접 추가 (여기에 적어주세요)' },
        ],
      },
      { key: 'q_topics_other', label: '1. 배우고 싶은 주제를 모두 골라주세요 (여러 개 가능)', type: 'INPUT_TEXT', value: '샷 세팅 보정' },
      { key: 'q_p1', label: '2-1. 1순위 (꼭 먼저 배우고 싶은 것)', type: 'DROPDOWN', value: ['d1'], options: [{ id: 'd1', text: '[추출] 물 온도·추출 변수, 맛이 왜 달라지나' }] },
      { key: 'q_p2', label: '2-2. 2순위', type: 'DROPDOWN', value: ['d2'], options: [{ id: 'd2', text: '직접 추가한 주제 (1번에 적은 것)' }] },
      { key: 'q_p3', label: '2-3. 3순위', type: 'DROPDOWN', value: [], options: [] },
      { key: 'q_note', label: '3. 직접 추가·자유 서술', type: 'TEXTAREA', value: 'QC 기준이 궁금해요' },
    ],
  },
};

describe('탈리 설문 파서', () => {
  it('옵션 라벨의 [카테고리] 접두를 떼고 주제 키를 찾는다', () => {
    expect(topicKeyFromLabel('[추출] 핸드드립 레시피 잡기')).toBe('filter-brewing');
    expect(topicKeyFromLabel('[우유]  라떼아트 (하트·로제타)')).toBe('latte-art');
    expect(topicKeyFromLabel('없는 주제')).toBeNull();
  });

  it('formId 로 지점을 판정한다', () => {
    expect(storeForForm('Bzy5WQ')).toBe('pangyo');
    expect(storeForForm('nope')).toBeNull();
  });

  it('응답 하나를 topics·custom·priorities·note 로 정규화한다', () => {
    const r = parseTallyPayload(payload as never);
    expect('error' in r).toBe(false);
    if ('error' in r) return;
    expect(r.store).toBe('pangyo');
    expect(r.name).toBe('한지우');
    expect(r.submissionId).toBe('sub-1');
    expect(r.topics).toEqual(['water-temp', 'latte-art']);
    expect(r.custom).toEqual(['샷 세팅 보정']);
    expect(r.priorities).toEqual(['water-temp', 'custom', null]);
    expect(r.note).toBe('QC 기준이 궁금해요');
  });

  it('다른 이벤트·모르는 폼은 거른다', () => {
    expect(parseTallyPayload({ ...payload, eventType: 'OTHER' } as never)).toEqual({ error: 'FORM_RESPONSE 가 아닙니다.' });
    expect('error' in parseTallyPayload({ ...payload, data: { ...payload.data, formId: 'x' } } as never)).toBe(true);
  });
});
