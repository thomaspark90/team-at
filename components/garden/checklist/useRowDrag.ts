'use client';

import { useState, type PointerEvent } from 'react';
import type { DropTarget } from '@/lib/checklist/ordering';

// 손잡이로 행을 끌어 옮기기 — 마우스·터치 공용. HTML5 드래그는 휴대폰에서 동작하지 않아 포인터 이벤트로 만든다.
// 행 요소에 data-row-id 를 달고, 손잡이에 handleProps 를 펼친다(손잡이는 touch-none 필수: 스크롤과 충돌).

const EDGE = 64; // 화면 가장자리에 닿으면 자동 스크롤
const SCROLL_STEP = 14;

export function useRowDrag(onDrop: (id: number, drop: DropTarget) => void) {
  const [dragId, setDragId] = useState<number | null>(null);
  const [over, setOver] = useState<DropTarget | null>(null);

  const end = () => {
    setDragId(null);
    setOver(null);
  };

  const handleProps = (id: number) => ({
    onPointerDown: (e: PointerEvent<HTMLElement>) => {
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      setDragId(id);
    },
    onPointerMove: (e: PointerEvent<HTMLElement>) => {
      if (dragId == null) return;
      if (e.clientY < EDGE) window.scrollBy(0, -SCROLL_STEP);
      else if (e.clientY > window.innerHeight - EDGE) window.scrollBy(0, SCROLL_STEP);
      const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-row-id]');
      if (!row) return;
      const box = row.getBoundingClientRect();
      setOver({ targetId: Number(row.dataset.rowId), place: e.clientY < box.top + box.height / 2 ? 'before' : 'after' });
    },
    onPointerUp: () => {
      if (dragId != null && over && over.targetId !== dragId) onDrop(dragId, over);
      end();
    },
    onPointerCancel: end,
  });

  return { dragId, over, handleProps };
}
