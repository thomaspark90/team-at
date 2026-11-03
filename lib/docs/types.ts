// 내부 공유 문서(/docs 목록 · /d/[token] 열람)의 데이터 형식.
// 본문은 마크다운 대신 블록 배열로 둔다 — 렌더러 의존성 없이 서버에서만 그리고,
// 같은 데이터를 옵시디언용 마크다운으로도 뽑을 수 있게.
// 문장 안 **굵게** 는 렌더러가 처리한다.

export type DocBlock =
  | { t: 'p'; text: string }
  | { t: 'ul'; items: string[] }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'note'; text: string }; // 회색 보조 문단(주의·근거)

export type DocSection = { id: string; title: string; blocks: DocBlock[] };

export type InternalDoc = {
  slug: string; // 공유 토큰 파생 키 — 바꾸면 기존 링크가 끊긴다
  title: string;
  subtitle: string;
  updated: string; // YYYY-MM-DD
  sections: DocSection[];
};
