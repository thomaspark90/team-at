'use client';

import { useRouter } from 'next/navigation';

// 전처리5 상품 선택기 — 상품이 수십 개라 링크 칩으로 깔면 화면이 넘친다.
// 값이 바뀌면 URL 의 product 만 갈아끼운다(나머지 조건은 유지).
// ⚠️ 서버 컴포넌트에서 함수 prop(hrefFor 같은)을 받으면 직렬화가 안 돼 렌더가 통째로 실패한다
// (2026-08-26 실사고) — 조건은 문자열로 받아서 URL 을 여기서 만든다.
export default function HoursProductPicker({
  products,
  value,
  unit,
  grain,
  span,
}: {
  products: { product: string; category: string; qty: number; gram: boolean }[];
  value: string;
  unit: string;
  grain: string;
  span: string;
}) {
  const router = useRouter();
  return (
    <select
      value={value}
      onChange={(e) =>
        router.push(
          `/finance/prep/hours?unit=${unit}&product=${encodeURIComponent(e.target.value)}&grain=${grain}&span=${span}`,
        )
      }
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
