// 설정 › 계정의 '사람 × 권한' 표 열 정의(2026-11-20 대표 지시: 모든 권한을 한 표에서).
// 첫 열은 인원, 둘째 열부터 권한 — 화면 출입(섹션·가든 탭·스탭밀 탭) → 기능 권한 → 알림 담당 순.
// 열은 레지스트리(sections·tabs·topics)에서 만들어지므로 탭·알림 항목을 추가하면 표에도 자동으로 생긴다.
// 가든 화면 열은 내비(GARDEN_NAV) 순서라 '홈'이 항상 맨 앞에 온다.
import { SECTIONS } from '@/lib/access/sections';
import { GARDEN_NAV, GARDEN_TABS, type GardenTab } from '@/lib/garden/tabs';
import { STUDIO_TABS } from '@/lib/studio/tabs';
import { GARDEN_TOPICS, type GardenTopicId } from '@/lib/garden-notify-topics';
import { groupByNav } from '@/lib/garden/notify-topic-groups';

export type MatrixSource =
  | { type: 'sections'; key: string } // 상위 섹션 출입
  | { type: 'tabs'; key: string } // 가든 화면 출입
  | { type: 'studioTabs'; key: string } // 스탭밀 화면 출입
  | { type: 'editor' } // 운영진(finance.schedule_editors)
  | { type: 'comments' } // 교육 코멘트 전체 열람(profiles.can_view_comments)
  | { type: 'topic'; id: GardenTopicId } // 항목별 담당자(알림) · 원두 수령 담당(권한)
  | { type: 'finance'; id: 'transfer' | 'stock' }; // 송금·재고 수신자

export type MatrixColumn = { id: string; label: string; desc: string; source: MatrixSource };
export type MatrixSub = { label: string; columns: MatrixColumn[] };
export type MatrixGroupId = 'sections' | 'garden' | 'studio' | 'feature' | 'notify';
export type MatrixGroup = {
  id: MatrixGroupId;
  label: string;
  /** 이 섹션이 꺼져 있으면 묶음의 칸이 적용되지 않는다(흐리게) */
  needsSection?: string;
  subs: MatrixSub[];
};

const tabCol = (t: GardenTab): MatrixColumn => ({ id: `tabs:${t.key}`, label: t.label, desc: t.desc ?? '', source: { type: 'tabs', key: t.key } });

/** 가든 탭을 내비 메뉴 순서로 — 내비에 없는 탭은 상위 화면(경로 기준) 뒤에 붙이고, 나머지는 '기타'. */
function gardenSubs(): MatrixSub[] {
  const byKey = new Map(GARDEN_TABS.map((t) => [t.key, t]));
  const inNav = new Set(GARDEN_NAV.flatMap((e) => [...e.keys, ...(e.hidden ?? [])]));
  const rest = GARDEN_TABS.filter((t) => !inNav.has(t.key));
  const placed = new Set<string>();
  const subs = GARDEN_NAV.map((e) => {
    const main = [...e.keys, ...(e.hidden ?? [])].map((k) => byKey.get(k)).filter((t): t is GardenTab => !!t);
    const children = rest.filter((r) => main.some((m) => m.href !== '/garden' && r.href.startsWith(m.href + '/')));
    children.forEach((c) => placed.add(c.key));
    const label = main.length === 1 ? main[0].label : e.label;
    return { label, columns: [...main, ...children].map(tabCol) };
  });
  const other = rest.filter((r) => !placed.has(r.key));
  // '설정' 은 내비 맨 끝이라 그 앞에 기타(제철 단어 등)를 끼운다
  if (other.length) subs.splice(subs.length - 1, 0, { label: '기타', columns: other.map(tabCol) });
  return subs;
}

const topicCol = (t: { id: GardenTopicId; label: string; desc: string }): MatrixColumn => ({
  id: `topic:${t.id}`,
  label: t.label,
  desc: t.desc,
  source: { type: 'topic', id: t.id },
});

/** 알림 담당 — 가든 항목은 내비 순서, 이어서 스탭밀 항목, 끝에 회계(송금 요청). */
function notifySubs(): MatrixSub[] {
  // reviewIssue(구 공통 토픽)는 GARDEN_TOPICS 에 없어 자연히 빠진다. beanReceive 는 알림이 아니라 기능 권한.
  const garden = GARDEN_TOPICS.filter((t) => t.scope === 'garden' && t.id !== 'beanReceive');
  const stock: MatrixColumn = { id: 'finance:stock', label: '원두 재고', desc: '재고 20%·소진 시 알림', source: { type: 'finance', id: 'stock' } };
  const subs: MatrixSub[] = groupByNav([...garden.map((t) => ({ tab: t.tab, col: topicCol(t) })), { tab: 'pricing', col: stock }]).map((g) => ({
    label: g.label,
    columns: g.items.map((i) => i.col),
  }));
  const staffmeal = GARDEN_TOPICS.filter((t) => t.scope === 'staffmeal');
  if (staffmeal.length) subs.push({ label: 'Staff Meal', columns: staffmeal.map(topicCol) });
  subs.push({
    label: '회계',
    columns: [{ id: 'finance:transfer', label: '송금 요청', desc: '새 송금 요청이 등록되면 알림', source: { type: 'finance', id: 'transfer' } }],
  });
  return subs;
}

export function buildMatrix(): MatrixGroup[] {
  const receive = GARDEN_TOPICS.find((t) => t.id === 'beanReceive')!;
  return [
    {
      id: 'sections',
      label: '섹션 출입',
      subs: [{ label: '', columns: SECTIONS.map((s) => ({ id: `sections:${s.key}`, label: s.label, desc: s.desc, source: { type: 'sections', key: s.key } })) }],
    },
    { id: 'garden', label: 'Garden Service 화면 출입', needsSection: 'garden', subs: gardenSubs() },
    {
      id: 'studio',
      label: 'Staff Meal 화면 출입',
      needsSection: 'studio',
      subs: [{ label: '', columns: STUDIO_TABS.map((t) => ({ id: `studioTabs:${t.key}`, label: t.label, desc: t.desc ?? '', source: { type: 'studioTabs', key: t.key } })) }],
    },
    {
      id: 'feature',
      label: '기능 권한',
      subs: [
        {
          label: '',
          columns: [
            {
              id: 'editor',
              label: '운영진',
              desc: '스케줄 작성·배포·연차 기록, 체크리스트 전체 열람·조 수정·항목 관리·대리 체크, 가입 신청 알림 수신',
              source: { type: 'editor' },
            },
            { ...topicCol(receive), label: '원두 수령 담당' },
            { id: 'comments', label: '교육 코멘트 열람', desc: '모든 교육 코멘트 보기(간편 계정만 지정 가능)', source: { type: 'comments' } },
          ],
        },
      ],
    },
    { id: 'notify', label: '알림 담당', subs: notifySubs() },
  ];
}

export const matrixColumns = (groups: MatrixGroup[]) => groups.flatMap((g) => g.subs.flatMap((s) => s.columns));

/** 표에서 켜고 끌 수 없는 권한 — 표 아래에 어디서 정해지는지 안내한다(가든서비스 권한 전수 조사, 2026-11-20). */
export const OFF_MATRIX_PERMISSIONS: { label: string; rule: string }[] = [
  { label: '교육 운영(매니저 화면)', rule: "간편 계정의 역할이 '운영' 역할이면 켜집니다 — 이름을 눌러 역할을 바꾸거나, 아래 역할 관리에서 역할의 운영 여부를 바꿉니다. 세부 스케줄 기재는 대표·관리자만." },
  { label: '상품 추이 · 날씨 분석의 숫자 열람', rule: '화면 출입 외에 재무 역할이 필요합니다(상품 추이=재무 멤버, 날씨 분석=관리자·분류 담당) — 회계 › 멤버 관리에서 지정.' },
  { label: '이 설정 화면 · 송금/재고 수신자 관리', rule: '재무 관리자(admin) 전용.' },
  { label: '카톡 [발주] 버튼', rule: '대표 + 서버 환경변수(KAKAO_ORDER_ALLOWED)에 등록된 계정 — 화면에서 바꿀 수 없습니다.' },
  { label: '판매가 바로 수정', rule: "'판매가 설정' 화면 출입이 켜져 있으면 레시피 표에서도 판매가를 고칠 수 있습니다." },
  { label: '커피 추출 이론 시안(theory-lab) · 내부 문서(/docs)', rule: '대표 전용.' },
];
