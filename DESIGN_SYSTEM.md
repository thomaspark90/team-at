# team-at — Design System

> **레퍼런스**: [midday.ai](https://midday.ai) 의 디자인 토큰을 그대로 이식.
> 따뜻한 무채색(크림 카드) · Freesentation · radius 10px 통일 · **장식적 액센트 컬러 없음**(상태 신호 2색은 예외 — §1).
> 소스: github.com/midday-ai/midday (`packages/ui/src/globals.css`) HSL 값 기준.
> 2026-08-08~09 전면 재정비: 카드 해체(One line per layer) · 폰트 5단계 램프 전체 적용 · 여백 리듬 확정.

---

## 1. 원칙 (Mood)

| 키워드 | 설명 |
|--------|------|
| **Warm monochrome** | 흑·백·그레이 + **따뜻한 크림 카드**(`45 18% 96%`). 장식적 컬러 액센트 없음. |
| **Type** | Freesentation(한글·라틴 커버). 기본 400, 강조는 **색 대비**(muted↔foreground) 우선 + 꼭 필요할 때만 **500(medium)**. 600/700 금지. |
| **Rounded & compact** | radius **`10px` 전 스케일 통일**(2026-08-01 결정, `tailwind.config.ts` — sm/md/lg/xl/2xl/3xl 전부 10px, `rounded-full`만 예외). pill(둥근 배지·칩)은 여전히 `rounded-full`로 별도. 큰 그림자 금지, 데이터 밀도 우선. **예외**: 높이 40~70px 안팎의 얇은 바 차트 막대는 `rounded-t`(10px)를 쓰면 알약처럼 보인다(2026-08-09 확인, `SalesSummary`/`MenuSalesReport`/`ReviewSalesReport`) — `style={{ borderRadius: '2px 2px 0 0' }}`로 고정 지정. |
| **Border, not shadow** | 면 구분은 그림자가 아니라 `border-border`. |
| **One line per layer** | 선은 한 계층만. 페이지 최상위 섹션은 카드 박스 대신 **가로 구분선**(`divide-y divide-border`)과 여백으로 구획(§7). 그리드 셀·정적 정보 박스는 보더 없이 `bg-muted/40` 면으로. 보더 유지 대상: 점선(업로드 등 어포던스) · 인터랙티브 요소(버튼·인풋·클릭 가능한 내비 카드) · 상태색 보더(선택/활성 신호) · 플로팅 오버레이(모달·드롭다운·툴팁) · 테이블 · 차트 내부. `ta-card`는 이제 페이지 섹션이 아니라 이런 예외(오버레이·독립형 카드)에만 쓴다. |
| **Signal = 상태색 2종 한정** | 장식적 컬러는 없지만, **상태 신호**는 두 색으로 표준화: `emerald`(완료·정상) / `amber`(지연·미분류·확인 필요). 진짜 오류·삭제·음수는 `destructive` 토큰(`text-destructive`/`bg-destructive`) — 원시 `red-500`/`red-600` 등 직접 색상 클래스 금지, 반드시 토큰 경유. |

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
| `--destructive` | `0 84% 60%` | 오류·삭제·음수 — `text-destructive`/`bg-destructive`로만 사용, 원시 `red-*` 금지 |
| `--radius-sm/md/lg` | `10px` (globals.css, 미사용 vestige) | 실제 반영은 `tailwind.config.ts`의 `borderRadius` — sm/md/lg/xl/2xl/3xl 전부 `10px`, `full`만 원형 예외 |

**상태 신호 2색** (토큰화되어 있지 않은 Tailwind 팔레트 직접 사용 — §1 참고):

| 색 | 용도 | 대표 클래스 |
|----|------|------------|
| `emerald-600` | 완료·정상·해결됨 | `text-emerald-600` |
| `amber-500/600` | 지연·미분류·확인 필요 | `text-amber-600`, `bg-amber-500`(배지) |

**차트**(`--chart-*`): 순수 흑/백 라인·바 + 회색 그리드(`--chart-grid-stroke #e6e6e6`, `--chart-bar-fill #000`, `--chart-actual-line #000`, 보조 `#666`). 컬러 시리즈 없음 — 상태 신호 2색과 별개.

---

## 3. 타이포그래피

| 패밀리 | 스택 | 용도 |
|--------|------|------|
| sans / serif | `'Freesentation', system-ui, sans-serif` | 전 텍스트 단일 패밀리(한글·라틴 모두 커버). `.font-serif`도 동일 패밀리 |

폰트: [Freesentation](https://freesentation.blog/) (OFL) — `/public/fonts` 셀프호스팅 woff2, 실사용 웨이트 400/500 두 파일만 로드(각 248KB).

- 기본 웨이트 **400**. 강조는 색 대비 우선 — 웨이트를 쓸 땐 **`font-medium`(500)만** (2026-07-05 확정: 600/700 금지, 활성 탭·선택 pill·합계 행·뱃지 등 상태 강조 전용). 크기(15/22px)가 이미 위계를 만드는 타이틀·큰 숫자·11px 라벨엔 웨이트 안 씀.
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

램프 외 크기 금지 — 발견 시 위 표로 스냅 (예외는 §7).

---

## 4. 재사용 프리미티브 (`globals.css` `@layer components`)

| 클래스 | = |
|--------|---|
| `.ta-card` | `rounded-md border border-border bg-card p-6`. 페이지 최상위 섹션에는 쓰지 않는다(§1·§7) — 모달·팝오버 등 플로팅 패널, `/install`·`/s/[token]` 같은 화면 중앙 단일 카드(포커스드 단일 액션 페이지) 정도로 한정. 스탭밀(`/studio`)·가든(`/garden`)에서 그래도 쓸 땐 `bg-background`(흰색) 오버라이드(2026-07-06). |
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

## 6. 여백 리듬 (카드 해체 이후의 구획 문법)

카드 보더가 사라진 자리는 **간격**이 대신 구분한다. 두 단계로 나눠 생각한다.

1. **섹션 사이** — 페이지 안에서 서로 다른 기능 단위(예: "송금 대기" ↔ "자동 수집 상태" ↔ "월별 자료 현황")는 `divide-y divide-border` 컨테이너 안에서 각 섹션에 `pb-[54px]`(첫 섹션) / `py-[54px]`(중간) / `pt-[54px]`(마지막)를 준다.
   - **컴포넌트로 분리된 섹션도 예외 없이 적용한다.** 페이지가 여러 리포트 컴포넌트(예: `SalesSummary` + `MenuSalesReport` + `ReviewSalesReport`)를 이어 붙이는 경우, 페이지 쪽에서 `flex`+`gap`으로만 간격을 주면 컴포넌트 사이에 **구분선이 빠진다** — 이 상태로 방치돼 한쪽엔 선이 있고 한쪽엔 없는 불일치가 실제로 있었다(2026-08-09, `/garden/sales`). 올바른 구성: 페이지는 이어 붙일 컴포넌트들을 감싸는 `divide-y divide-border` 컨테이너 하나만 두고, **각 컴포넌트가 자기 최상위 `<section>`에 직접 `py-[54px]`를 준다**(자기 완결적이어야 어느 페이지에 꽂혀도 간격이 깨지지 않는다). 내부에 자체 `divide-y`를 또 갖는 컴포넌트(예: `SalesSummary`)는 페이지 쪽에서 `py-[54px]` 래퍼 한 겹으로만 감싸면 된다.
2. **섹션 안, 내용 단위 사이** — 같은 섹션 안의 소제목+본문 블록, 반복 아이템(리스트 행·업로드 슬롯·칸반 카드)은 보더가 있던 시절보다 **세로 간격을 약 2배**로 준다. 감이 아니라 실제 기준: 기존 `gap-2~4`류는 `gap-4~8`로, 반복 행 padding `py-2~2.5`류는 `py-4~5`로. 가로 간격은 그대로 — 그리드가 줄바꿈되면 `gap-x`/`gap-y`를 분리해서 세로만 키운다.

**유지 — 늘리지 않는 곳**: 제목과 바로 아래 설명(1~2px 밀착), 라벨↔인풋, 칩/버튼 사이 가로 간격, 테이블 행 padding(데이터 밀도 우선), 차트·모달·인쇄물 내부, 내비게이션 바.

**판단 기준**: "이 간격이 서로 다른 내용 단위를 나누는가?" — 그렇다면 늘리고, 같은 단위 안의 요소라면 유지한다.

---

## 7. 금지

- 장식적 컬러 액센트(예: 블루 `#0099FF`), pill 라운드, 인라인 `fontFamily`/`fontWeight`/`boxShadow`, 하드코딩 hex.
- 원시 `text-red-*`/`bg-red-*` 등 색상 유틸 직접 사용 — 오류·삭제·음수는 반드시 `destructive` 토큰 경유(§1·§2).
- 페이지 최상위 섹션에 보더 있는 카드 박스(`ta-card`류) — §1 One line per layer, §4 예외 참고.
- 램프 밖 폰트 크기(`text-[10/12/14/16/17/18/20/21px]`, `text-sm`, `text-xs`) — §3 5단계로 스냅. 차트 내부·아이콘 글리프·특수 목적의 대형 편집형 타이포(예: 모바일 전체화면 메뉴)는 케이스별 예외로 남을 수 있으나 기본은 램프.
- `components/StoryPreview.tsx`(카페 스토리 출력물), 원두카드 인쇄 시트(`BeanCardPrint.tsx`의 `bc-*` 영역)는 이 시스템 대상 아님 — 별도 브랜드/출력물 비주얼.
