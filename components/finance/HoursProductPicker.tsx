'use client';

import { useRouter } from 'next/navigation';

// 전처리5 상품 선택기 — 상품이 수십 개라 링크 칩으로 깔면 화면이 넘친다.
// 값이 바뀌면 URL 의 product 만 갈아끼운다(나머지 조건은 유지).
export default function HoursProductPicker({
  products,
  value,
  hrefFor,
}: {
  products: { product: string; category: string; qty: number; gram: boolean }[];
  value: string;
  hrefFor: (product: string) => string;
}) {
  const router = useRouter();
  return (
    <select
      value={value}
      onChange={(e) => router.push(hrefFor(e.target.value))}
      className="ta-input text-[13px]"
      aria-label="상품 선택"
    >
      {products.map((p) => (
        <option key={p.product} value={p.product}>
          {p.gram ? '⚖ ' : ''}
          {p.product} · {p.category} ({Math.round(p.qty).toLocaleString()})
        </option>
      ))}
    </select>
  );
}
