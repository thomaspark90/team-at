'use client';

import { useRef, useState, type PointerEvent } from 'react';
import type { DropTarget } from '@/lib/checklist/ordering';

// 손잡이로 행을 끌어 옮기기 — 마우스·터치 공용. HTML5 드래그는 휴대폰에서 동작하지 않아 포인터 이벤트로 만든다.
// 행 요소에 data-row-id 를 달고, 손잡이에 handleProps 를 펼친다(손잡이는 touch-none 필수: 스크롤과 충돌).
// 이벤트가 렌더링보다 빠르게 이어질 수 있어 판정은 ref 로 하고, state 는 표시에만 쓴다.

const EDGE = 64; // 화면 가장자리에 닿으면 자동 스크롤
const SCROLL_STEP = 14;

const targetAt = (x: number, y: number): DropTarget | null => {
  const row = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-row-id]');
  if (!row) return null;
  const box = row.getBoundingClientRect();
  return { targetId: Number(row.dataset.rowId), place: y < box.top + box.height / 2 ? 'before' : 'after' };
};

export function useRowDrag(onDrop: (id: number, drop: DropTarget) => void) {
  const dragging = useRef<number | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<DropTarget | null>(null);

  const end = () => {
    dragging.current = null;
    setDragId(null);
    setOver(null);
  };

  const handleProps = (id: number) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      dragging.current = id;
      setDragId(id);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (dragging.current == null) return;
      if (e.clientY < EDGE) window.scrollBy(0, -SCROLL_STEP);
      else if (e.clientY > window.innerHeight - EDGE) window.scrollBy(0, SCROLL_STEP);
      const next = targetAt(e.clientX, e.clientY);
      if (next) setOver(next);
    },
    onPointerUp: (e: PointerEvent<HTMLElement>) => {
      const from = dragging.current;
      const drop = targetAt(e.clientX, e.clientY);
      end();
      if (from != null && drop && drop.targetId !== from) onDrop(from, drop);
    },
    onPointerCancel: end,
  });

  return { dragId, over, handleProps };
}
