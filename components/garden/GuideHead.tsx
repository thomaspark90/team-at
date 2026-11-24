import type { ReactNode } from 'react';

// 교육 자료 화면(추출 이론 · 원두 이해 · 추천 레시피)의 공통 머리 — 제목 + 한 줄 설명 + 목차(2026-11-24 디자인 개선).
// 목차는 같은 화면 안 섹션으로 가는 글자 링크. 긴 화면에서 목차를 따라다니게 하려면 따로 붙인다(bean-guide/SectionNav).
export default function GuideHead({
  title,
  lead,
  sections,
}: {
  title: string;
  lead: ReactNode;
  sections?: { id: string; label: string }[];
}) {
  return (
    <header className="mb-12 pt-2 sm:mb-16 sm:pt-6">
      <h1 className="m-0 text-display">{title}</h1>
      <div className="ta-prose mt-3 text-body text-muted-foreground">{lead}</div>
      {sections && sections.length > 0 && (
        <nav aria-label="섹션 바로가기" className="fc-shade-t mt-6 flex flex-wrap gap-x-5 gap-y-1 pt-4 text-body">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="fc-txt">
              {s.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
