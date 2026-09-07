// 매니저 교육 주제 — 스탭 위시리스트의 선택지. 코드 상수로 시작(2026-09-07 대표 결정).
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
      { key: 'espresso-dialing', label: '에스프레소 세팅 · 다이얼링' },
      { key: 'filter-brewing', label: '필터 추출 · 레시피 조정' },
      { key: 'ek43-grind', label: 'EK43 분쇄도 · 캘리브레이션' },
      { key: 'water-temp', label: '물 · 온도 · 추출 변수 이해' },
    ],
  },
  {
    key: 'milk',
    label: '우유',
    topics: [
      { key: 'milk-steaming', label: '스티밍 · 마이크로폼' },
      { key: 'latte-art', label: '라떼아트 기본 패턴' },
      { key: 'milk-alternatives', label: '대체유 다루기' },
    ],
  },
  {
    key: 'sensory',
    label: '센서리',
    topics: [
      { key: 'cupping', label: '커핑 · 테이스팅 노트 잡기' },
      { key: 'bean-explaining', label: '원두 설명 · 향미 표현' },
      { key: 'quality-check', label: '맛 이상 감지 · 품질 체크' },
    ],
  },
  {
    key: 'equipment',
    label: '장비',
    topics: [
      { key: 'machine-cleaning', label: '머신 · 그라인더 청소 루틴' },
      { key: 'troubleshooting', label: '장비 트러블슈팅' },
      { key: 'water-maintenance', label: '정수 · 스케일 관리' },
    ],
  },
  {
    key: 'service',
    label: '접객',
    topics: [
      { key: 'bean-recommend', label: '원두 소개 · 추천 화법' },
      { key: 'complaint', label: '클레임 · 난처한 상황 대응' },
      { key: 'peak-flow', label: '피크 타임 동선 · 역할 분담' },
    ],
  },
];

export const TEACHING_TOPICS: TeachingTopic[] = TEACHING_CATEGORIES.flatMap((c) => c.topics);
export const TEACHING_TOPIC_KEYS = TEACHING_TOPICS.map((t) => t.key);
export const topicLabel = (key: string) => TEACHING_TOPICS.find((t) => t.key === key)?.label ?? key;
