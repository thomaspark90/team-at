'use client';

import { useEffect, useRef } from 'react';

// 제철 단어 — 손님이 익명으로 단어를 두고 가는 페이지의 프론트.
// 디자인 원본: Figma '제철 단어 — Garden Service' (파일 47CQNr6kcEDVkpdH5YtYCK).
// 아직 저장 백엔드 없음 — 제출은 화면 연출('놓아두는 중')까지만 동작한다.

const WORDS: Array<{ t: string; s: number }> = [
  { t: '모기장', s: 3 }, { t: '나무 그늘', s: 2 }, { t: '열대야', s: 2 },
  { t: '소나기', s: 3 }, { t: '계곡물', s: 1 }, { t: '살얼음', s: 2 },
  { t: '수박', s: 3 }, { t: '매미', s: 1 }, { t: '부채', s: 2 },
  { t: '평상', s: 2 }, { t: '빗소리', s: 1 }, { t: '선풍기 바람', s: 1 },
  { t: '찬 물컵', s: 1 },
];

const CSS = `
.jw-root {
  --ground: #26332C;
  --ink: #F0F4EC;
  --ink-soft: rgba(240, 244, 236, 0.68);
  --ink-faint: rgba(240, 244, 236, 0.45);
  --accent: #D9E8C8;
  --line: rgba(255, 255, 255, 0.28);
  --glass: rgba(255, 255, 255, 0.14);
  position: fixed;
  inset: 0;
  overflow: hidden;
  background: var(--ground);
  color: var(--ink);
  font-family: -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif;
  -webkit-font-smoothing: antialiased;
}
.jw-root .bg {
  position: absolute;
  inset: -12%;
  z-index: 0;
  background:
    linear-gradient(115deg, rgba(0,0,0,0) 16%, rgba(233, 240, 228, 0.5) 26%, rgba(0,0,0,0) 38%),
    linear-gradient(115deg, rgba(0,0,0,0) 44%, rgba(203, 218, 197, 0.32) 53%, rgba(0,0,0,0) 62%),
    linear-gradient(115deg, rgba(0,0,0,0) 68%, rgba(222, 233, 214, 0.4) 78%, rgba(0,0,0,0) 88%),
    radial-gradient(70% 55% at 88% 4%, rgba(226, 235, 220, 0.85) 0%, rgba(139, 165, 141, 0.45) 40%, rgba(0,0,0,0) 72%),
    radial-gradient(60% 50% at 4% 100%, rgba(30, 42, 52, 0.9) 0%, rgba(0,0,0,0) 65%),
    linear-gradient(215deg, #5F7A66 0%, #3B5244 42%, #2A3A34 72%, #223039 100%);
  filter: blur(46px) saturate(1.05);
}
.jw-root header {
  position: absolute;
  top: 0; left: 0; right: 0;
  padding: 26px 24px 0 70px;
  z-index: 3;
  pointer-events: none;
}
.jw-root .eyebrow {
  font-size: 10px;
  letter-spacing: 0.28em;
  color: var(--ink-faint);
  margin: 0 0 10px;
}
.jw-root h1 {
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.06em;
  margin: 0 0 6px;
}
.jw-root .season {
  font-size: 10px;
  font-weight: 400;
  color: var(--ink-soft);
  margin: 0;
  line-height: 1.7;
}
.jw-root .field {
  position: absolute;
  inset: 0;
  z-index: 1;
}
.jw-root .word {
  position: absolute;
  white-space: nowrap;
  color: var(--ink);
  cursor: default;
  opacity: 0;
  transition: opacity 2s ease, color 0.4s ease;
  will-change: transform;
}
.jw-root .word.shown { opacity: var(--op, 0.9); }
.jw-root .word:hover { color: var(--accent); }
.jw-root .word.s1 { font-size: 15px; font-weight: 300; --op: 0.62; }
.jw-root .word.s2 { font-size: 19px; font-weight: 400; --op: 0.8; }
.jw-root .word.s3 { font-size: 25px; font-weight: 500; --op: 0.94; }
.jw-root .word.pending {
  color: var(--accent);
  border-bottom: 1px dashed var(--accent);
  padding-bottom: 2px;
}
.jw-root .word.pending::after {
  content: "놓아두는 중";
  display: block;
  font-size: 11px;
  font-weight: 400;
  line-height: 1.8;
  color: var(--ink-faint);
  margin-top: 5px;
}
.jw-root .word.pending.shown { --op: 0.55; }
@media (prefers-reduced-motion: reduce) {
  .jw-root .word { transition: opacity 0.3s ease; }
}
.jw-root .leave {
  position: absolute;
  left: 50%;
  bottom: max(20px, env(safe-area-inset-bottom));
  transform: translateX(-50%);
  width: min(420px, calc(100vw - 40px));
  z-index: 4;
}
.jw-root .leave form {
  display: flex;
  gap: 8px;
  background: var(--glass);
  -webkit-backdrop-filter: blur(20px) saturate(1.2);
  backdrop-filter: blur(20px) saturate(1.2);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 8px 8px 8px 18px;
  box-shadow: 0 12px 32px rgba(10, 18, 14, 0.25);
}
.jw-root .leave input {
  flex: 1;
  min-width: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 15px;
  letter-spacing: 0.02em;
}
.jw-root .leave input::placeholder { color: var(--ink-faint); }
.jw-root .leave button {
  border: 0;
  background: rgba(248, 250, 246, 0.88);
  color: #2E3B33;
  font: inherit;
  font-size: 11px;
  line-height: 1.8;
  padding: 9px 16px;
  border-radius: 11px;
  cursor: pointer;
}
.jw-root .leave button:focus-visible,
.jw-root .leave input:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.jw-root .leave .hint {
  text-align: center;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--ink-faint);
  margin: 10px 0 0;
  line-height: 1.6;
}
.jw-root .received {
  position: absolute;
  left: 50%;
  bottom: 110px;
  transform: translateX(-50%) translateY(6px);
  width: min(360px, calc(100vw - 48px));
  background: var(--glass);
  -webkit-backdrop-filter: blur(20px) saturate(1.2);
  backdrop-filter: blur(20px) saturate(1.2);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 16px 18px;
  font-size: 11px;
  line-height: 1.8;
  color: var(--ink-soft);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.5s ease, transform 0.5s ease;
  z-index: 5;
}
.jw-root .received.show { opacity: 1; transform: translateX(-50%) translateY(0); }
.jw-root footer {
  position: absolute;
  right: 20px;
  bottom: max(24px, env(safe-area-inset-bottom));
  font-size: 10px;
  letter-spacing: 0.2em;
  color: var(--ink-faint);
  z-index: 3;
  user-select: none;
}
@media (max-width: 720px) {
  .jw-root footer { display: none; }
  .jw-root header { padding-left: 40px; }
}
`;

type FloatParams = { ax: number; ay: number; wx: number; wy: number; px: number; py: number };
type FloatEl = HTMLSpanElement & { _float?: FloatParams };

function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

export default function WordsClient() {
  const fieldRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const receivedRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<{ addPending: (t: string) => void } | null>(null);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;

    let placed: Array<{ x: number; y: number }> = [];
    const floaters: FloatEl[] = [];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers: number[] = [];
    let raf = 0;

    function fieldBounds() {
      const w = field!.clientWidth, h = field!.clientHeight;
      return { x0: w < 720 ? 30 : 70, x1: w - 40, y0: h * 0.22, y1: h - 150 };
    }
    function tooClose(x: number, y: number, minD: number) {
      return placed.some((p) => Math.hypot(p.x - x, p.y - y) < minD);
    }
    function position(el: FloatEl) {
      const b = fieldBounds();
      const minD = Math.min(140, (b.x1 - b.x0) / 3.2);
      let x = 0, y = 0, tries = 0;
      do {
        x = rand(b.x0, b.x1 - el.offsetWidth - 10);
        y = rand(b.y0, b.y1);
        tries++;
      } while (tooClose(x, y, minD) && tries < 60);
      placed.push({ x, y });
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    }
    function makeWord(w: { t: string; s: number }, pending?: boolean) {
      const el = document.createElement('span') as FloatEl;
      el.className = 'word s' + (w.s || 2) + (pending ? ' pending' : '');
      el.textContent = w.t;
      el._float = {
        ax: rand(6, 14), ay: rand(8, 18),
        wx: rand(0.15, 0.35), wy: rand(0.12, 0.3),
        px: rand(0, Math.PI * 2), py: rand(0, Math.PI * 2),
      };
      field!.appendChild(el);
      position(el);
      floaters.push(el);
      return el;
    }
    function layout() {
      placed = [];
      floaters.length = 0;
      field!.innerHTML = '';
      WORDS.forEach((w, i) => {
        const el = makeWord(w);
        timers.push(window.setTimeout(() => el.classList.add('shown'), 250 + i * 130));
      });
    }
    layout();

    let rt = 0;
    const onResize = () => {
      clearTimeout(rt);
      rt = window.setTimeout(layout, 300);
    };
    window.addEventListener('resize', onResize);

    if (!reduceMotion) {
      const drift = (now: number) => {
        const t = now / 1000;
        for (const el of floaters) {
          const f = el._float!;
          const x = f.ax * Math.sin(t * f.wx + f.px);
          const y = f.ay * Math.sin(t * f.wy + f.py);
          el.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`;
        }
        raf = requestAnimationFrame(drift);
      };
      raf = requestAnimationFrame(drift);

      // 랜덤 페이드 아웃/인 — 동시에 전체의 ~10%만, 새 자리에서 다시 떠오름
      let hidden = 0;
      timers.push(window.setInterval(() => {
        const pool = floaters.filter(
          (el) => !el.classList.contains('pending') && el.classList.contains('shown')
        );
        const cap = Math.max(1, Math.round(pool.length * 0.1));
        if (hidden >= cap || pool.length < 4) return;
        const el = pool[Math.floor(Math.random() * pool.length)];
        hidden++;
        el.classList.remove('shown');
        timers.push(window.setTimeout(() => {
          placed = floaters.filter((o) => o !== el).map((o) => ({ x: o.offsetLeft, y: o.offsetTop }));
          position(el);
          el.classList.add('shown');
          hidden--;
        }, rand(3500, 6500)));
      }, 3000) as unknown as number);
    }

    let toastTimer = 0;
    apiRef.current = {
      addPending(t: string) {
        const el = makeWord({ t, s: 2 }, true);
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('shown')));
        const received = receivedRef.current;
        if (received) {
          received.classList.add('show');
          clearTimeout(toastTimer);
          toastTimer = window.setTimeout(() => received.classList.remove('show'), 4200);
        }
      },
    };

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((id) => { clearTimeout(id); clearInterval(id); });
      clearTimeout(rt);
      clearTimeout(toastTimer);
      window.removeEventListener('resize', onResize);
      apiRef.current = null;
    };
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = inputRef.current;
    if (!input) return;
    const t = input.value.trim().replace(/\s+/g, ' ');
    if (!t) { input.focus(); return; }
    apiRef.current?.addPending(t);
    input.value = '';
    input.blur();
  };

  return (
    <div className="jw-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="bg" aria-hidden="true" />
      <header>
        <p className="eyebrow">GARDEN SERVICE</p>
        <h1>제철 단어</h1>
        <p className="season">
          여름의 단어들이 놓여 있습니다.<br />당신의 단어도 하나 두고 가세요.
        </p>
      </header>
      <div className="field" ref={fieldRef} aria-label="이 계절의 단어들" />
      <div className="leave">
        <form onSubmit={onSubmit} autoComplete="off">
          <input ref={inputRef} type="text" maxLength={10} placeholder="여름이면 떠오르는 단어" aria-label="두고 갈 단어" />
          <button type="submit">보내기</button>
        </form>
        <p className="hint">단어만 · 여덟 자 안팎 · 가든서비스가 읽어본 뒤 게시됩니다</p>
      </div>
      <div className="received" ref={receivedRef} role="status">
        잘 받았습니다. 가든서비스에서 확인 후.<br />어딘가에 조용히 놓아두겠습니다.
      </div>
      <footer>양재천 · 여름</footer>
    </div>
  );
}
