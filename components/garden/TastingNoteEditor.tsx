'use client';

import { useState } from 'react';

// 테이스팅 노트 편집 — 노트 하나 = 칩 하나. ×로 지우고, 입력칸에 쓰고 Enter(또는 쉼표·추가)로 더한다.
// 값은 기존과 같은 쉼표 문자열('백합, 사과잼, …')로 주고받아 저장 형식은 그대로다.
// 레시피 편집기에서 발주 때 노트를 그대로 보여주고 더하기·지우기만 하게(2026-10-31 대표 지시).

const split = (v: string) => v.split(/[,，·]/).map((x) => x.trim()).filter(Boolean);

export default function TastingNoteEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [input, setInput] = useState('');
  const notes = split(value);

  const add = () => {
    const fresh = split(input).filter((n) => !notes.includes(n));
    if (fresh.length > 0) onChange([...notes, ...fresh].join(', '));
    setInput('');
  };
  const remove = (n: string) => onChange(notes.filter((x) => x !== n).join(', '));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {notes.length > 0 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {notes.map((n) => (
            <span
              key={n}
              className="rounded-full bg-background text-body text-foreground shadow-soft-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, height: 32, padding: '0 6px 0 12px' }}
            >
              {n}
              <button
                onClick={() => remove(n)}
                className="text-muted-foreground hover:text-foreground"
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', fontFamily: 'inherit', lineHeight: 1 }}
                aria-label={`${n} 지우기`}
                title="지우기"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <span className="text-caption text-muted-foreground">노트 없음</span>
      )}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="노트 추가 (예: 자두) — Enter"
          className="ta-input w-full"
        />
        <button onClick={add} disabled={!input.trim()} className="ta-btn disabled:opacity-30" style={{ flexShrink: 0 }}>
          추가
        </button>
      </div>
    </div>
  );
}
