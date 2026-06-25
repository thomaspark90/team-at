# team-at — Design System

> **참고 무드보드**: [all-natural.framer.website](https://all-natural.framer.website) 의 비주얼 시스템을 분석·추출한 토큰 기반.
> 미니멀 / 모노크롬 + 단일 일렉트릭 블루 액센트 / 산세리프(Inter) / 큰 라운드(pill) / 타이트한 헤드라인.
> 카피·이미지·콘텐츠는 team-at 고유 내용으로 채우고, **토큰과 패턴만** 차용합니다.

---

## 1. 디자인 원칙 (Mood)

| 키워드 | 설명 |
|--------|------|
| **Monochrome-first** | 거의 모든 면이 순수 흑(`#000`)·백(`#fff`)·그레이. 색은 절제. |
| **Single accent** | 일렉트릭 블루(`#0099FF`) 하나만 액센트로. CTA·하이라이트·링크에만. |
| **Tight & confident** | 헤드라인은 크고, 자간 마이너스, 행간 100~105%로 꽉 조임. |
| **Soft geometry** | 버튼·태그는 완전 pill(50px), 카드·이미지는 10px 라운드. |
| **Airy** | 섹션 간 넉넉한 여백, 콘텐츠는 중앙 정렬 그리드. |

---

## 2. 색상 (Color Tokens)

추출된 실제 사용 빈도 기준. 흑/백/그레이가 99%, 블루가 유일한 컬러.

### Core
| 토큰 | 값 | 용도 |
|------|-----|------|
| `--color-bg` | `#FFFFFF` | 기본 배경 |
| `--color-fg` | `#000000` | 기본 텍스트, 헤드라인 |
| `--color-bg-invert` | `#000000` | 다크 섹션 배경 |
| `--color-fg-invert` | `#FFFFFF` | 다크 섹션 텍스트 |

### Accent
| 토큰 | 값 | 용도 |
|------|-----|------|
| `--color-accent` | `#0099FF` `rgb(0,153,255)` | Primary CTA, 링크 hover, 강조 |
| `--color-accent-fg` | `#FFFFFF` | 액센트 위 텍스트 |

### Neutral / Gray scale
| 토큰 | 값 | 용도 |
|------|-----|------|
| `--gray-400` | `#999999` `rgb(153,153,153)` | 보조 텍스트, 캡션 |
| `--gray-300` | `#C9C9C9` | placeholder, disabled |
| `--gray-200` | `#D4D4D4` | 보더, 디바이더 |
| `--gray-100` | `rgba(0,0,0,0.03)` | 카드/섹션 미세 배경 |

### Alpha (오버레이·그림자용)
| 토큰 | 값 | 용도 |
|------|-----|------|
| `--overlay-dark` | `rgba(0,0,0,0.2)` | 이미지 위 어둡게 |
| `--overlay-light` | `rgba(255,255,255,0.5)` | 글래스/밝게 |
| `--line-soft` | `rgba(0,0,0,0.06)` | 얇은 구분선 |

```css
:root {
  --color-bg: #FFFFFF;
  --color-fg: #000000;
  --color-bg-invert: #000000;
  --color-fg-invert: #FFFFFF;
  --color-accent: #0099FF;
  --color-accent-fg: #FFFFFF;
  --gray-400: #999999;
  --gray-300: #C9C9C9;
  --gray-200: #D4D4D4;
  --gray-100: rgba(0,0,0,0.03);
  --overlay-dark: rgba(0,0,0,0.2);
  --overlay-light: rgba(255,255,255,0.5);
  --line-soft: rgba(0,0,0,0.06);
}
```

---

## 3. 타이포그래피 (Typography)

### Font Families
주 폰트는 **Inter** 패밀리. 헤드라인은 더 타이트한 `Inter Tight` / `Inter Display`.
모노 라벨/숫자는 `Azeret Mono` 또는 `Geist Mono` 선택.

| 토큰 | 스택 | 용도 |
|------|------|------|
| `--font-display` | `"Inter Display", "Inter Tight", Inter, sans-serif` | 대형 헤드라인 (H1–H2) |
| `--font-sans` | `Inter, "Inter Placeholder", system-ui, sans-serif` | 본문, UI 전반 |
| `--font-mono` | `"Azeret Mono", "Geist Mono", ui-monospace, monospace` | 라벨, 숫자, 캡션 |

> Next.js: `next/font/google` 로 `Inter`, `Inter_Tight`, `Azeret_Mono` import 권장.

### Weights
실제 사용: **500(가장 많음)** · 400 · 600 · 700 · 900.
- 본문/UI 기본: **500 (Medium)** — 이 사이트는 Regular 대신 Medium을 기본으로 씀(핵심 무드).
- 캡션/보조: 400
- 강조 헤드라인: 700 / 900

### Type Scale
추출된 px값(데스크탑 기준)을 정리한 스케일. 헤드라인일수록 자간·행간을 조임.

| 토큰 | size | line-height | letter-spacing | weight | 용도 |
|------|------|-------------|----------------|--------|------|
| `display-xl` | 64–72px* | 100% | -1.85px | 700/900 | 히어로 H1 |
| `display-lg` | 46px | 105% | -1.25px | 700 | 섹션 헤드라인 H2 |
| `heading-md` | 35px | 110% | -.9px | 600/700 | 서브 헤드라인 H3 |
| `heading-sm` | 28–30px | 120% | -.5px | 600 | 카드 타이틀 |
| `title` | 20–25px | 125% | -.5px | 500/600 | 리스트 타이틀 |
| `body-lg` | 18px | 145% | -.01em | 500 | 리드 본문 |
| `body` | 16px | 145% | 0 | 500 | 기본 본문 |
| `body-sm` | 14px | 145% | 0 | 400/500 | 보조 텍스트 |
| `caption` | 11–12px | 125% | .3px | 500 | 라벨/캡션(대문자) |

\* `display-xl`은 원본이 반응형 스케일링. 데스크탑에서 64–72px, 모바일 36–40px로 clamp 권장:
`font-size: clamp(2.5rem, 6vw, 4.5rem);`

```css
.h1 { font: 900 clamp(2.5rem,6vw,4.5rem)/1 var(--font-display); letter-spacing:-1.85px; }
.h2 { font: 700 46px/1.05 var(--font-display); letter-spacing:-1.25px; }
.h3 { font: 600 35px/1.1 var(--font-display); letter-spacing:-.9px; }
.body { font: 500 16px/1.45 var(--font-sans); }
.caption { font: 500 12px/1.25 var(--font-mono); letter-spacing:.3px; text-transform:uppercase; }
```

---

## 4. 스페이싱 & 라운드 (Spacing / Radius)

### Border Radius (추출값)
| 토큰 | 값 | 용도 |
|------|-----|------|
| `--radius-pill` | `50px` | 버튼, 태그, 칩 (완전 pill) |
| `--radius-xl` | `40px` | 큰 카드/섹션 컨테이너 |
| `--radius-md` | `10px` | 이미지, 일반 카드 |
| `--radius-none` | `0px` | 풀블리드 섹션·구분선 |

### Spacing Scale (8px 베이스 권장)
`4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96 · 128px`
- 섹션 상하 패딩: 96–128px (데스크탑) / 48–64px (모바일)
- 컴포넌트 내부 패딩: 16–24px
- 인라인 갭: 8–12px

### Layout
- 최대 콘텐츠 폭: `1200px` 중앙 정렬, 좌우 거터 24px
- 그리드: 12 columns / gap 24px

---

## 5. 컴포넌트 패턴 (Components)

### Buttons
| 변형 | 배경 | 텍스트 | 라운드 | 비고 |
|------|------|--------|--------|------|
| **Primary** | `#000000` | `#FFFFFF` | `50px` pill | 기본 CTA. hover 시 `--color-accent` 또는 살짝 축소 |
| **Accent** | `#0099FF` | `#FFFFFF` | `50px` pill | 강조 CTA |
| **Secondary** | transparent + `1px` border `--gray-200` | `#000000` | `50px` pill | 보조 |
| **Ghost** | transparent | `#000000` | `50px` | 텍스트형 |

- 패딩: `12px 24px` (md) / `14px 28px` (lg)
- 폰트: 500, 14–16px
- 트랜지션: `all .2s ease`

```css
.btn { display:inline-flex; align-items:center; gap:8px;
  padding:14px 28px; border-radius:var(--radius-pill);
  font:500 16px/1 var(--font-sans); transition:all .2s ease; }
.btn--primary { background:var(--color-fg); color:#fff; }
.btn--primary:hover { background:var(--color-accent); }
.btn--secondary { background:transparent; color:var(--color-fg); border:1px solid var(--gray-200); }
```

### Cards
- 배경 `#fff` 또는 `--gray-100`, 라운드 `10px`(이미지) / `40px`(피처)
- 그림자 최소화 — 보더(`--gray-200`)나 미세 배경으로 구분
- 이미지 상단, 텍스트 하단(타이틀 `heading-sm` + 보조 `body-sm` 그레이)

### Navigation (Header)
- 좌: 로고(워드마크, weight 700, 자간 타이트)
- 중앙/우: 텍스트 메뉴(`body-sm`, weight 500) — 예: Collections / Products / Brand
- 우측 끝: Primary pill CTA
- 배경 `#fff`, 스크롤 시 살짝 블러/보더(`--line-soft`)
- 높이 64–72px

### Tag / Chip
- pill(50px), 배경 `--gray-100` 또는 보더, 텍스트 `caption`(대문자 mono)

### Section 헤더 패턴
- 작은 mono 캡션(대문자, 그레이) → 큰 `display-lg` 헤드라인 → 보조 `body-lg` 그레이 순.

---

## 6. 모션 (Motion)

- 기본 트랜지션: `.2s ease` (hover), `.4–.6s cubic-bezier(.16,1,.3,1)` (등장)
- 스크롤 진입: fade + 살짝 위로(translateY 16–24px)
- 이미지 hover: scale 1.03, overflow hidden
- 버튼 hover: 배경 컬러 전환 또는 scale .98

---

## 7. 적용 우선순위 (team-at 반영 순서)

1. **토큰 세팅** — `tailwind.config.ts` / CSS 변수에 색·폰트·라운드 등록
2. **타입 스케일** — Inter 패밀리 로드 + `.h1~.caption` 유틸
3. **버튼·헤더** — pill 버튼, 모노크롬 네비
4. **섹션 레이아웃** — 1200px 그리드, 96–128px 섹션 패딩
5. **카드·태그** — 10px/40px 라운드, 그레이 보더

---

### 부록 — Tailwind 매핑 예시

```ts
// tailwind.config.ts (theme.extend)
colors: {
  fg: '#000000', bg: '#FFFFFF',
  accent: '#0099FF',
  gray: { 100:'rgba(0,0,0,0.03)', 200:'#D4D4D4', 300:'#C9C9C9', 400:'#999999' },
},
fontFamily: {
  display: ['"Inter Display"','"Inter Tight"','Inter','sans-serif'],
  sans: ['Inter','system-ui','sans-serif'],
  mono: ['"Azeret Mono"','ui-monospace','monospace'],
},
borderRadius: { pill:'50px', xl:'40px', md:'10px' },
letterSpacing: { tightest:'-1.85px', tighter:'-1.25px', tight:'-.5px' },
```
