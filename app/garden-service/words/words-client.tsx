'use client';

import { useEffect, useRef, useState } from 'react';

// 제철 단어 — 손님이 익명으로 단어를 두고 가는 페이지의 프론트.
// 디자인 원본: Figma '제철 단어 — Garden Service' (파일 47CQNr6kcEDVkpdH5YtYCK).
// 아직 저장 백엔드 없음 — 제출은 화면 연출('놓아두는 중')까지만 동작한다.

import { SEED_WORDS as WORDS } from './seed-words';

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
  font-family: 'Freesentation', -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", "Malgun Gothic", sans-serif;
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
.jw-root .logo {
  width: 106px;
  aspect-ratio: 206 / 35;
  background-color: var(--ink);
  opacity: 0.85;
  -webkit-mask: url('/brand/garden-service.png') no-repeat left center / contain;
  mask: url('/brand/garden-service.png') no-repeat left center / contain;
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
.jw-root .word.s1 { font-size: 13px; font-weight: 300; --op: 0.62; }
.jw-root .word.s2 { font-size: 15px; font-weight: 400; --op: 0.8; }
.jw-root .word.s3 { font-size: 17px; font-weight: 500; --op: 0.94; }
.jw-root .word.pending {
  color: var(--accent);
  border-bottom: 1px dashed var(--accent);
  padding-bottom: 2px;
}
.jw-root .word.pending::after {
  content: "놓아두는 중";
  display: block;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.8;
  color: var(--ink-faint);
  margin-top: 5px;
}
.jw-root .word.pending.shown { --op: 0.55; }
@media (prefers-reduced-motion: reduce) {
  .jw-root .word { transition: opacity 0.3s ease; }
}
.jw-root .view-toggle {
  position: absolute;
  top: 24px;
  right: 20px;
  z-index: 6;
  border: 1px solid var(--line);
  background: var(--glass);
  -webkit-backdrop-filter: blur(16px);
  backdrop-filter: blur(16px);
  color: var(--ink-soft);
  font: inherit;
  font-size: 12px;
  padding: 7px 14px;
  border-radius: 999px;
  cursor: pointer;
}
.jw-root .view-toggle:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.jw-root .list-overlay {
  position: absolute;
  inset: 0;
  z-index: 5;
  background: rgba(18, 26, 22, 0.55);
  -webkit-backdrop-filter: blur(14px);
  backdrop-filter: blur(14px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.jw-root .list-panel {
  width: min(520px, 100%);
  max-height: 72vh;
  overflow-y: auto;
  background: var(--glass);
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 24px 26px;
}
.jw-root .list-label {
  font-size: 11px;
  letter-spacing: 0.12em;
  color: var(--ink-faint);
  margin: 0 0 8px;
}
.jw-root .list-label + .list-label,
.jw-root .list-words + .list-label { margin-top: 20px; }
.jw-root .list-words {
  font-size: 15px;
  line-height: 2.2;
  color: var(--ink);
  margin: 0;
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
  font-size: 12px;
  line-height: 1.8;
  padding: 9px 16px;
  border-radius: 11px;
  cursor: pointer;
}
.jw-root .leave button:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.jw-root .leave input:focus { outline: none; }
.jw-root .leave form:focus-within { border-color: rgba(255, 255, 255, 0.45); }
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
  font-size: 12px;
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
  const apiRef = useRef<{ addPending: (t: string) => void } | null>(null);
  const sendingRef = useRef(false);
  const toastTimerRef = useRef(0);
  const [toastMsg, setToastMsg] = useState<React.ReactNode>(null);
  const [showList, setShowList] = useState(false);
  const [guestWords, setGuestWords] = useState<string[]>([]);

  const showToast = (node: React.ReactNode) => {
    setToastMsg(node);
    clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToastMsg(null), 4200);
  };

  // iOS 키보드가 뷰포트를 줄이면 고정 컨테이너 밖(전역 흰 배경)이 드러난다 —
  // 이 페이지에 있는 동안 html/body 배경을 페이지 배경 톤으로 맞춘다.
  useEffect(() => {
    const de = document.documentElement, b = document.body;
    const prev = [de.style.background, b.style.background];
    de.style.background = '#223039';
    b.style.background = 'linear-gradient(#26332C, #223039)';
    return () => {
      de.style.background = prev[0];
      b.style.background = prev[1];
    };
  }, []);

  useEffect(() => {
    const field = fieldRef.current;
    if (!field) return;

    let placed: Array<{ x: number; y: number; w: number; h: number }> = [];
    const floaters: FloatEl[] = [];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const timers: number[] = [];
    let raf = 0;

    function fieldBounds() {
      const w = field!.clientWidth, h = field!.clientHeight;
      return { x0: w < 720 ? 30 : 70, x1: w - 40, y0: h * 0.22, y1: h - 150 };
    }
    type Rect = { x: number; y: number; w: number; h: number };
    // 확장(pad)된 상자끼리의 겹침 면적 — pad는 부유 진폭 + 최소 여백
    function overlapArea(a: Rect, b: Rect, pad: number) {
      const ix = Math.min(a.x + a.w + pad, b.x + b.w) - Math.max(a.x - pad, b.x);
      const iy = Math.min(a.y + a.h + pad, b.y + b.h) - Math.max(a.y - pad, b.y);
      return ix > 0 && iy > 0 ? ix * iy : 0;
    }
    function position(el: FloatEl) {
      const b = fieldBounds();
      const w = el.offsetWidth, h = el.offsetHeight;
      const pad = field!.clientWidth < 720 ? 18 : 28;
      let best: Rect | null = null, bestScore = Infinity;
      for (let i = 0; i < 140; i++) {
        const x = rand(b.x0, Math.max(b.x0 + 1, b.x1 - w - 10));
        const y = rand(b.y0, Math.max(b.y0 + 1, b.y1 - h));
        const rect = { x, y, w, h };
        let score = 0;
        for (const p of placed) score += overlapArea(rect, p, pad);
        if (score === 0) { best = rect; break; }
        if (score < bestScore) { bestScore = score; best = rect; }
      }
      placed.push(best!);
      el.style.left = best!.x + 'px';
      el.style.top = best!.y + 'px';
    }
    function makeWord(w: { t: string; s: number }, pending?: boolean) {
      const el = document.createElement('span') as FloatEl;
      el.className = 'word s' + (w.s || 2) + (pending ? ' pending' : '');
      el.textContent = w.t;
      const small = field!.clientWidth < 720;
      el._float = {
        ax: small ? rand(3, 7) : rand(6, 14), ay: small ? rand(4, 9) : rand(8, 18),
        wx: rand(0.15, 0.35), wy: rand(0.12, 0.3),
        px: rand(0, Math.PI * 2), py: rand(0, Math.PI * 2),
      };
      field!.appendChild(el);
      position(el);
      floaters.push(el);
      return el;
    }
    // 게시된 손님 단어 — 텍스트 기반 결정적 크기(1~3)로 무리에 섞는다
    let approved: string[] = [];
    function sizeOf(t: string) {
      return ((t.charCodeAt(0) + t.length) % 3) + 1;
    }
    function layout() {
      placed = [];
      floaters.length = 0;
      field!.innerHTML = '';
      const all = [...WORDS, ...approved.map((t) => ({ t, s: sizeOf(t) }))];
      all.forEach((w, i) => {
        const el = makeWord(w);
        timers.push(window.setTimeout(() => el.classList.add('shown'), 250 + i * 130));
      });
    }
    layout();

    fetch('/api/garden-words')
      .then((r) => (r.ok ? r.json() : { words: [] }))
      .then((d: { words?: Array<{ text: string }> }) => {
        const list = (d.words ?? []).map((w) => String(w.text)).filter(Boolean);
        if (list.length) {
          approved = list;
          setGuestWords(list);
          layout();
        }
      })
      .catch(() => {
        // 목록을 못 가져와도 기본 제철 단어는 이미 떠 있다
      });

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
          placed = floaters.filter((o) => o !== el).map((o) => ({ x: o.offsetLeft, y: o.offsetTop, w: o.offsetWidth, h: o.offsetHeight }));
          position(el);
          el.classList.add('shown');
          hidden--;
        }, rand(3500, 6500)));
      }, 3000) as unknown as number);
    }

    apiRef.current = {
      addPending(t: string) {
        const el = makeWord({ t, s: 2 }, true);
        requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('shown')));
      },
    };

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((id) => { clearTimeout(id); clearInterval(id); });
      clearTimeout(rt);
      window.removeEventListener('resize', onResize);
      apiRef.current = null;
    };
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input = inputRef.current;
    if (!input || sendingRef.current) return;
    const t = input.value.trim().replace(/\s+/g, ' ');
    if (!t) { input.focus(); return; }
    sendingRef.current = true;
    input.value = '';
    input.blur();
    try {
      const res = await fetch('/api/garden-words', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t }),
      });
      if (!res.ok) throw new Error();
      apiRef.current?.addPending(t);
      showToast(
        <>잘 받았습니다. 가든서비스에서 확인 후.<br />어딘가에 조용히 놓아두겠습니다.</>
      );
    } catch {
      showToast('지금은 단어를 받을 수 없어요. 잠시 후 다시 시도해주세요.');
    } finally {
      sendingRef.current = false;
    }
  };

  return (
    <div className="jw-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="bg" aria-hidden="true" />
      <header>
        <div className="logo" role="img" aria-label="Garden Service" />
        <h1>제철 단어</h1>
        <p className="season">
          여름의 단어들이 놓여 있습니다.<br />당신의 단어도 하나 두고 가세요.
        </p>
      </header>
      <div className="field" ref={fieldRef} aria-label="이 계절의 단어들" />
      <button className="view-toggle" onClick={() => setShowList((v) => !v)}>
        {showList ? '흩어 보기' : '모아 보기'}
      </button>
      {showList && (
        <div className="list-overlay" onClick={() => setShowList(false)}>
          <div className="list-panel" role="dialog" aria-label="이 계절의 단어 전체" onClick={(e) => e.stopPropagation()}>
            <p className="list-label">이 계절의 단어</p>
            <p className="list-words">{WORDS.map((w) => w.t).join('  ·  ')}</p>
            {guestWords.length > 0 && (
              <>
                <p className="list-label">손님이 두고 간 단어</p>
                <p className="list-words">{guestWords.join('  ·  ')}</p>
              </>
            )}
          </div>
        </div>
      )}
      <div className="leave">
        <form onSubmit={onSubmit} autoComplete="off">
          <input ref={inputRef} type="text" maxLength={10} placeholder="여름이면 떠오르는 단어" aria-label="두고 갈 단어" />
          <button type="submit">보내기</button>
        </form>
        <p className="hint">단어만 · 여덟 자 안팎 · 가든서비스가 읽어본 뒤 게시됩니다</p>
      </div>
      <div className={'received' + (toastMsg ? ' show' : '')} role="status">
        {toastMsg}
      </div>
      <footer>양재천 · 여름</footer>
    </div>
  );
}
