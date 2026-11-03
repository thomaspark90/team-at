import type { ReactNode } from 'react';
import type { DocBlock, InternalDoc } from '@/lib/docs/types';

// 내부 문서 본문 렌더러 — 서버 컴포넌트(훅 없음). /docs 미리보기와 /d/[token] 공유 화면이 함께 쓴다.
// 폰트는 4단계 램프(caption/body/title/display)만, 면은 .ta-panel(Surface, not border).

// 문장 안 **굵게** → <strong>
function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={i} className="font-medium text-foreground">
        {part.slice(2, -2)}
      </strong>
    ) : (
      part
    ),
  );
}

function Block({ b }: { b: DocBlock }) {
  switch (b.t) {
    case 'p':
      return <p className="ta-prose text-body leading-relaxed">{inline(b.text)}</p>;
    case 'note':
      return <p className="ta-prose text-body leading-relaxed text-muted-foreground">{inline(b.text)}</p>;
    case 'ul':
      return (
        <ul className="ta-prose list-disc space-y-2 pl-5 text-body leading-relaxed">
          {b.items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </ul>
      );
    case 'table':
      return (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-body">
            <thead>
              <tr className="border-b border-border">
                {b.head.map((h) => (
                  <th key={h} className="whitespace-nowrap py-2 pr-6 text-caption font-normal text-muted-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i} className="border-b border-border/60 align-top">
                  {r.map((c, j) => (
                    <td key={j} className={`py-3 pr-6 leading-relaxed ${j === 0 ? 'whitespace-nowrap font-medium' : ''}`}>
                      {inline(c)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export default function DocArticle({ doc }: { doc: InternalDoc }) {
  return (
    <article className="space-y-8">
      {/* 목차 — 섹션이 많아 바로 이동 */}
      <nav className="ta-panel">
        <span className="ta-label">목차</span>
        <ol className="grid gap-x-8 gap-y-1.5 text-body sm:grid-cols-2">
          {doc.sections.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-muted-foreground transition-colors hover:text-foreground">
                {s.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {doc.sections.map((s) => (
        <section key={s.id} id={s.id} className="ta-panel scroll-mt-16 space-y-4">
          <h2 className="m-0 text-title">{s.title}</h2>
          {s.blocks.map((b, i) => (
            <Block key={i} b={b} />
          ))}
        </section>
      ))}
    </article>
  );
}
