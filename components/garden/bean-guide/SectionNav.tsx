'use client';

import { BEAN_SECTIONS, GLOSSARY_ID } from '@/lib/garden/bean-guide/sections';

// 전역 바(44px) 아래에 붙는 섹션 바로가기. 용어는 접혀 있으므로 눌렀을 때 펼친다.
export default function SectionNav() {
  const open = (id: string) => {
    if (id === GLOSSARY_ID) document.getElementById(id)?.setAttribute('open', '');
  };
  return (
    <nav aria-label="섹션 바로가기" className="sticky top-11 z-20 -mt-8 mb-10 flex flex-wrap gap-x-4 gap-y-1 border-b border-border bg-background/90 py-2 backdrop-blur sm:-mt-12 sm:mb-16">
      {BEAN_SECTIONS.map((s) => (
        <a key={s.id} href={`#${s.id}`} onClick={() => open(s.id)} className="whitespace-nowrap text-body text-muted-foreground hover:text-foreground">
          {s.label}
        </a>
      ))}
    </nav>
  );
}
