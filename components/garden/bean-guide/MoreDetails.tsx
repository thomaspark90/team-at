const Chevron = () => (
  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true" className="transition-transform group-open:rotate-180">
    <path d="M2.5 4.5 6 8l3.5-3.5" />
  </svg>
);

// 긴 목록의 나머지를 펼치는 버튼. 처음에는 접혀 있다.
export function MoreDetails({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <details className="group">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 py-2 text-caption text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
        <span className="group-open:hidden">{label}</span>
        <span className="hidden group-open:inline">접기</span>
        <Chevron />
      </summary>
      {children}
    </details>
  );
}

// 제목만 보이고 내용 전체를 펼치는 소단락.
export function FoldedSection({ id, title, className = '', titleClassName = 'text-body font-medium', children }: { id?: string; title: string; className?: string; titleClassName?: string; children: React.ReactNode }) {
  return (
    <details id={id} className={`group ${className}`}>
      <summary className="flex w-fit cursor-pointer list-none items-center gap-2 py-1 hover:text-foreground [&::-webkit-details-marker]:hidden">
        <span className={titleClassName}>{title}</span>
        <span className="text-muted-foreground">
          <Chevron />
        </span>
      </summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}
