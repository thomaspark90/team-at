import { sourceNumber } from '@/lib/garden/extraction-theory';

// 본문 인용 표시 — 번호를 누르면 페이지 아래 출처 목록으로 이동한다.
export default function TheoryCite({ ids }: { ids: string[] }) {
  return (
    <span className="whitespace-nowrap text-caption text-muted-foreground">
      {' '}
      {ids.map((id) => (
        <a key={id} href={`#src-${sourceNumber(id)}`} className="hover:text-foreground">
          [{sourceNumber(id)}]
        </a>
      ))}
    </span>
  );
}
