import { TEACHING_TOPICS } from '@/lib/teaching/topics';
import { STORE_SURVEYS } from '@/lib/teaching/survey';
import type { StoreId } from '@/lib/types';

// 탈리 웹훅(FORM_RESPONSE) 페이로드 → 설문 응답 정규화. 순수 함수 — tests/teaching-survey.test.ts 가 고정.
// 탈리 폼 구조(2026-09-09): 이름(단답) · 1. 주제 체크박스(옵션 라벨 "[카테고리] 주제", '직접 추가 …' Other) ·
// 2-1/2-2/2-3 순위 드롭다운(같은 라벨 + '직접 추가한 주제 (1번에 적은 것)') · 3. 자유 서술(장문).

export type TallyField = {
  key: string;
  label: string;
  type: string;
  value: unknown;
  options?: { id: string; text: string }[];
};

export type TallyPayload = {
  eventId?: string;
  eventType?: string;
  createdAt?: string;
  data?: {
    responseId?: string;
    submissionId?: string;
    formId?: string;
    formName?: string;
    createdAt?: string;
    fields?: TallyField[];
  };
};

export type ParsedSurvey = {
  store: StoreId;
  formId: string;
  submissionId: string;
  name: string;
  submittedAt: string; // ISO
  topics: string[];
  custom: string[];
  priorities: (string | null)[]; // [1순위, 2순위, 3순위] — 주제 키 | 'custom' | null
  note: string;
};

const norm = (s: string) => s.replace(/\s+/g, '').replace(/[·•・]/g, '·');

/** 옵션 라벨("[추출] 핸드드립 레시피 잡기") → 주제 키. 못 찾으면 null */
export function topicKeyFromLabel(label: string): string | null {
  const stripped = norm(label.replace(/^\[[^\]]*\]\s*/, ''));
  const hit = TEACHING_TOPICS.find((t) => norm(t.label) === stripped);
  return hit?.key ?? null;
}

const isCustomPriority = (label: string) => /직접\s*추가/.test(label);

export function storeForForm(formId: string): StoreId | null {
  for (const [store, cfg] of Object.entries(STORE_SURVEYS)) {
    if (cfg && cfg.formId === formId) return store as StoreId;
  }
  return null;
}

/** 체크박스 값(옵션 id 배열)을 옵션 텍스트로 */
function selectedTexts(f: TallyField): string[] {
  const ids = Array.isArray(f.value) ? (f.value as unknown[]).map(String) : [];
  const opts = f.options ?? [];
  return ids.map((id) => opts.find((o) => o.id === id)?.text ?? '').filter(Boolean);
}

export function parseTallyPayload(p: TallyPayload): ParsedSurvey | { error: string } {
  const d = p.data;
  if (!d || p.eventType !== 'FORM_RESPONSE') return { error: 'FORM_RESPONSE 가 아닙니다.' };
  const formId = d.formId ?? '';
  const store = storeForForm(formId);
  if (!store) return { error: `등록되지 않은 폼: ${formId}` };
  const submissionId = d.submissionId || d.responseId || p.eventId || '';
  if (!submissionId) return { error: 'submissionId 없음' };
  const fields = d.fields ?? [];

  const byLabel = (re: RegExp, types?: string[]) =>
    fields.find((f) => re.test(f.label ?? '') && (!types || types.includes(f.type)));

  const nameField = byLabel(/^이름/, ['INPUT_TEXT']) ?? fields.find((f) => f.type === 'INPUT_TEXT');
  const name = String(nameField?.value ?? '').replace(/\s+/g, ' ').trim();
  if (!name) return { error: '이름 없음' };

  const topics: string[] = [];
  const custom: string[] = [];
  const cb = byLabel(/^1\./, ['CHECKBOXES']) ?? fields.find((f) => f.type === 'CHECKBOXES' && Array.isArray(f.options));
  if (cb) {
    for (const text of selectedTexts(cb)) {
      const key = topicKeyFromLabel(text);
      if (key) topics.push(key);
      else if (!/직접\s*추가/.test(text)) custom.push(text);
    }
  }
  // Other 입력 텍스트 — 탈리는 체크박스 'Other' 의 자유 입력을 같은 라벨의 INPUT_TEXT 로 따로 보낸다
  for (const f of fields) {
    if (f.type === 'INPUT_TEXT' && /^1\./.test(f.label ?? '') && typeof f.value === 'string' && f.value.trim()) {
      custom.push(f.value.trim());
    }
  }

  const priorityOf = (re: RegExp): string | null => {
    const f = byLabel(re, ['DROPDOWN']);
    if (!f) return null;
    const text = selectedTexts(f)[0] ?? (typeof f.value === 'string' ? f.value : '');
    if (!text) return null;
    if (isCustomPriority(text)) return 'custom';
    return topicKeyFromLabel(text);
  };
  const priorities = [priorityOf(/^2-1\./), priorityOf(/^2-2\./), priorityOf(/^2-3\./)];

  const noteField = byLabel(/^3\./, ['TEXTAREA']) ?? fields.find((f) => f.type === 'TEXTAREA');
  const note = String(noteField?.value ?? '').trim();

  return {
    store,
    formId,
    submissionId,
    name,
    submittedAt: d.createdAt ?? p.createdAt ?? new Date().toISOString(),
    topics: Array.from(new Set(topics)),
    custom: Array.from(new Set(custom)),
    priorities,
    note,
  };
}
