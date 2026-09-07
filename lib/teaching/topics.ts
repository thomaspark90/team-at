// 매니저 교육 주제 — 스탭 위시리스트의 선택지. 코드 상수로 시작(2026-09-07 대표 결정).
// 문구는 현장 말투로(2026-09-07 대표 지시) — 용어 설명이 아니라 스탭이 '이거 배우고 싶다'고 말하는 방식.
// key 는 finance.teaching_wishes.topic_key / teaching_sessions.topic_key 에 저장되므로
// 바꾸면 기존 요청·기록의 연결이 끊긴다. 문구(label)만 고치는 건 자유.
// 항목을 지울 때는 여기서 빼지 말고 retired: true 를 달아 기존 기록이 계속 읽히게 한다.

export type TeachingTopic = { key: string; label: string; retired?: boolean };
export type TeachingCategory = { key: string; label: string; topics: TeachingTopic[] };

export const TEACHING_CATEGORIES: TeachingCategory[] = [
  {
    key: 'extraction',
    label: '추출',
    topics: [
      { key: 'espresso-dialing', label: '에스프레소 맛 잡기 (도징·분쇄·추출시간)' },
      { key: 'filter-brewing', label: '핸드드립 레시피 잡기' },
      { key: 'ek43-grind', label: 'EK43 분쇄도 맞추기' },
      { key: 'water-temp', label: '물 온도·추출 변수, 맛이 왜 달라지나' },
    ],
  },
  {
    key: 'milk',
    label: '우유',
    topics: [
      { key: 'milk-steaming', label: '우유 스팀 (거품 곱게 내기)' },
      { key: 'latte-art', label: '라떼아트 (하트·로제타)' },
      { key: 'milk-alternatives', label: '오트·두유 스팀' },
    ],
  },
  {
    key: 'sensory',
    label: '맛',
    topics: [
      { key: 'cupping', label: '커핑, 맛 표현 찾기' },
      { key: 'bean-explaining', label: '손님한테 원두 맛 설명하기' },
      { key: 'quality-check', label: '맛이 이상할 때 원인 찾기' },
    ],
  },
  {
    key: 'equipment',
    label: '장비',
    topics: [
      { key: 'machine-cleaning', label: '머신·그라인더 청소 (백플러시·분해)' },
      { key: 'troubleshooting', label: '머신 고장 났을 때 대처' },
      { key: 'water-maintenance', label: '정수 필터·스케일 관리' },
    ],
  },
  {
    key: 'service',
    label: '손님 응대',
    topics: [
      { key: 'bean-recommend', label: '원두 추천 멘트' },
      { key: 'complaint', label: '컴플레인·곤란한 손님 대응' },
      { key: 'peak-flow', label: '피크타임 동선·역할 나누기' },
    ],
  },
];

export const TEACHING_TOPICS: TeachingTopic[] = TEACHING_CATEGORIES.flatMap((c) => c.topics);
export const TEACHING_TOPIC_KEYS = TEACHING_TOPICS.map((t) => t.key);
export const topicLabel = (key: string) => TEACHING_TOPICS.find((t) => t.key === key)?.label ?? key;
