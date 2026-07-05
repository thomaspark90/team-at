# team-at — Design System

> **레퍼런스**: [midday.ai](https://midday.ai) 의 디자인 토큰을 그대로 이식.
> 따뜻한 무채색(크림 카드) · IBM Plex Sans KR · 스퀘어(3px) · **액센트 컬러 없음**.
> 소스: github.com/midday-ai/midday (`packages/ui/src/globals.css`) HSL 값 기준.

---

## 1. 원칙 (Mood)

| 키워드 | 설명 |
|--------|------|
| **Warm monochrome** | 흑·백·그레이 + **따뜻한 크림 카드**(`45 18% 96%`). 컬러 액센트 없음. |
| **Type** | IBM Plex Sans KR(한글·라틴 커버). 기본 400, 강조는 **색 대비**(muted↔foreground) 우선 + 필요시 500/600. |
| **Square & compact** | radius `3px`(md, 전반 좌우) / sm 2 / lg 4. pill·큰 그림자 금지. 데이터 밀도 우선. |
| **Border, not shadow** | 면 구분은 그림자가 아니라 `border-border`. |
| **Signal = mono** | 수입/지출은 색이 아니라 부호·라벨로. 진짜 오류/삭제만 `destructive` 레드. |

---

## 2. 컬러 토큰 (HSL, `app/globals.css`)

CSS 변수 → Tailwind 유틸(`bg-*`, `text-*`, `border-*`)로 노출. 다크 테마 값도 정의됨(`.dark`).

| 토큰 | Light | 용도 |
|------|-------|------|
| `--background` | `0 0% 100%` | 페이지 배경 (`bg-background`) |
| `--foreground` | `0 0% 7%` | 본문·헤드라인 (`text-foreground`) |
| `--card` | `45 18% 96%` | 카드/패널 배경 (따뜻한 크림) |
| `--muted` / `--accent` | `40 11% 89%` / `40 10% 94%` | 미세 배경·hover |
| `--muted-foreground` | `0 0% 38%` | 보조·캡션 텍스트 |
| `--primary` | `240 5.9% 10%` | 다크 CTA/뱃지 배경 (`bg-primary`) |
| `--primary-foreground` | `0 0% 98%` | primary 위 텍스트 |
| `--border` | `45 5% 85%` | 보더·구분선 |
| `--input` | `240 5.9% 90%` | 입력 필드 보더 |
| `--ring` | `240 5.9% 10%` | 포커스 링 |
| `--destructive` | `0 84% 60%` | 오류·삭제·음수만 |
| `--radius-sm/md/lg` | `2 / 3 / 4px` | 명시 3-값. `rounded-md`(3px)가 버튼·인풋·카드 전반 |

**차트**(`--chart-*`): 순수 흑/백 라인·바 + 회색 그리드(`--chart-grid-stroke #e6e6e6`, `--chart-bar-fill #000`, `--chart-actual-line #000`, 보조 `#666`). 컬러 시리즈 없음.

---

## 3. 타이포그래피

| 패밀리 | 스택 | 용도 |
|--------|------|------|
| sans / serif | `'IBM Plex Sans KR', system-ui, sans-serif` | 전 텍스트 단일 패밀리(한글·라틴 모두 커버). `.font-serif`도 동일 패밀리 |

- 기본 웨이트 **400**. 강조는 색 대비 우선, 필요 시 500/600(로드된 웨이트: 300/400/500/600/700).
- 숫자·금액·테이블 셀에 `.tabular`(tabular-nums).
- 캡션/라벨: `.caption` 또는 `text-[11px] uppercase tracking-[0.06em] text-muted-foreground`.

**폰트 크기는 5단계 램프만 사용** (2026-07-05 확정, Figma 가이드와 동기):

| 크기 | 용도 |
|------|------|
| Display(`text-5xl` 등) | 브랜드/히어로 |
| `text-[22px]` | 페이지 타이틀 · KPI 큰 숫자 |
| `text-[15px]` | 카드·섹션 타이틀 |
| `text-[13px]` | 본문 · UI 기본(버튼·인풋·테이블·탭) |
| `text-[11px]` | 캡션 · 라벨 · 보조 |

램프 외 크기(`text-[10/12/14/16/17/18/20/21px]`) 금지 — 발견 시 위 표로 스냅.

---

## 4. 재사용 프리미티브 (`globals.css` `@layer components`)

| 클래스 | = |
|--------|---|
| `.ta-card` | `rounded-md border border-border bg-card p-6` |
| `.ta-input` | `h-9 rounded-md border border-input bg-transparent px-3 text-[13px] …` (input/select/textarea) |
| `.ta-btn` | 아웃라인 버튼 (h-9, border, hover:bg-accent) |
| `.ta-btn-primary` | 다크 프라이머리 버튼 (h-9, bg-primary) |
| `.ta-label` | 섹션 캡션 (uppercase, muted, 11px) |

세그먼트 토글: `rounded-md border border-border p-1` + 활성 `bg-primary text-primary-foreground rounded-sm`.

---

## 5. 테이블 (midday 핵심 룩)

- 헤더행: `text-[11px] uppercase tracking-[0.04em] text-muted-foreground`, 셀 `px-3 py-2`.
- 바디 셀: `px-3 py-2 text-[13px] text-foreground`, 행 구분 `border-t border-border`.
- 금액 열: `text-right tabular`. hover 행: `hover:bg-accent`. 컴팩트 유지.

---

## 6. 금지

- 액센트 블루(`#0099FF`) 등 컬러 액센트, pill 라운드, 인라인 `fontFamily`/`fontWeight`/`boxShadow`, 하드코딩 hex.
- `components/StoryPreview.tsx`(카페 스토리 출력물)는 이 시스템 대상 아님 — 별도 브랜드 비주얼.
