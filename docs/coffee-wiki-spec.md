# Coffee Wiki — 설계 스펙 v0.1 (2026-07-22)

Garden Service 내 커피 지식베이스. 유명 커피 유튜버 30명의 영상에서 주장(claim)을 추출해 토픽별로 교차검증하는 위키. grill-me 세션으로 확정된 설계.

## 확정 결정

| 항목 | 결정 |
|---|---|
| 1차 목적 | **팀 내부 지식베이스** (바리스타 교육·레시피 근거). 외부 공개·참여는 2차 |
| 위치·권한 | `/garden/wiki`, 읽기·승인 모두 기존 team-at 인증. 승인 큐는 `/garden/wiki/review` |
| 콘텐츠 단위 | **주장(claim)**: 유튜버 → 토픽 → 주장 + 근거 영상·타임스탬프 구간. 한국어 번역 저장 + 원문 병기 |
| 토픽 체계 | 시드 택소노미(그라인더/추출/로스팅/물/원두/장비비교…) 수동 정의 + AI가 신규 토픽 제안 → 승인 큐 |
| 교차검증 | AI가 주장 간 관계(동의/상충/보완/조건부) 제안 → 승인 → 토픽 페이지에 쟁점 맵 자동 구성 |
| 파이프라인 | **반자동**: 로컬 배치(yt-dlp 자막 + Claude API 추출·번역) → team-at ingest API → 웹 승인 큐에서 승인/수정 후 게시. 네이버페이 수집기 패턴 재사용 |
| 갱신 주기 | 초기 30명×10영상=300개 배치 → 이후 **주 1회** 신규 영상 체크 |
| 외부 참여 | 2차로 미룸. 단 스키마에 제안자·출처·상태(초안/승인) 필드를 처음부터 포함해 "외부 제안 → 승인" 모델로 확장 가능하게 |

## 리스크 메모

- **승인 큐 처리량**: 300개 영상 ≈ 주장 1,500~3,000개 예상. 승인 UI에 "영상 단위 일괄 승인 + 상충 관계 걸린 주장만 개별 검토" 완화 장치 필요.
- 리테일러 채널(Whole Latte Love·Seattle Coffee Gear·Clive)은 판매 편향 있음 → 독립 리뷰어(Sprometheus·Wired Gourmet·Chronicler·Tom's)와 교차 전제.
- 구독자 수치는 ±20% 오차 가능 → 파이프라인 구축 시 YouTube Data API로 재확인.

## 확정 소스 30선 (2026-07-22)

⭐ = 장비 의견 교차검증 핵심 소스

### 장비 교차검증 축 (14)
1. ⭐ James Hoffmann (~2.5M) — 추출·장비·과학·업계. 기준점 소스
2. ⭐ Lance Hedrick (~450K) — 추출·에스프레소·과학·장비. 논문 기반 실험
3. ⭐ The Real Sprometheus (~170K?) — 장비·에스프레소. 독립 리뷰어
4. ⭐ The Wired Gourmet (~70K?) — 장비·과학. 변인 통제형 그라인더 리뷰
5. ⭐ Tom's Coffee Corner (~60K?) — 장비·에스프레소. 가성비·수리/개조
6. ⭐ Kyle Rowsell (~110K) — 장비·에스프레소·로스팅. 가격대별 비교
7. ⭐ Whole Latte Love (~389K) — 장비·에스프레소. 리테일러(편향 감안)
8. ⭐ Seattle Coffee Gear (~694K) — 장비·추출. 리테일러(편향 감안)
9. ⭐ The Coffee Chronicler (~62K) — 장비·추출. Q그레이더 리뷰어
10. ⭐ Coffee Kev (~86K) — 장비. 영국/유럽 시장 관점
11. ⭐ Clive Coffee (~91K) — 장비·에스프레소. 프리미엄숍(편향 감안)
12. ⭐ Coffee Fusion (~84K) — 장비·에스프레소·바리스타. 호주 커피 스쿨
13. ⭐ Golden Brown Coffee (~326K) — 추출·장비·에스프레소. 보급형 현실론
14. ⭐ Artisti Coffee Roasters (~236K) — 장비·로스팅·바리스타. 호주 로스터리

### 추출/에스프레소 기법 (6)
15. morgandrinkscoffee / Morgan Eckroth (~1.4M) — 바리스타·에스프레소
16. Emilee Bryant (~121K) — 에스프레소·장비·바리스타
17. Hoon's Coffee (~255K) — 바리스타·에스프레소
18. European Coffee Trip (~385K) — 업계·추출·장비
19. Prima Coffee Equipment (~56K) — 장비·추출. 물 화학 등 교육
20. Tetsu Kasuya (~150K?) — 추출. 4:6 메소드 원전 (일본어, 자막 처리)

### 로스팅 (4)
21. Mill City Roasters (~42K) — 상업 로스팅 교육 표준
22. Sweet Maria's Coffee (~34K) — 홈로스팅·생두 고전
23. Virtual Coffee Lab (~40K?) — 홈로스터 체계 교육
24. ⭐ Kaffeemacher (~185K?) — 장비·로스팅·과학. 독일어권(자막 처리)

### 원두/업계/카페 운영 (6)
25. Coffee with April / Patrik Rolf (~90K?) — 업계·로스팅·추출
26. Tim Wendelboe (~25K) — 업계·로스팅. 간헐적이지만 권위 소스
27. Dak Coffee Roasters (~15K?) — 업계·로스팅 브이로그
28. Real Chris Baca (~77K) — 바리스타·업계. 팟캐스트 중심
29. Brian Quan (~27K) — 바리스타·장비
30. CAFICT (~607K) — 추출. 일본(자막 처리), Onyx Coffee Lab으로 교체 가능

### 교체 투입 후보군 (보류)
Toms Grinder Lab, The Captain's Coffee, Wolff College of Coffee, Seven Miles, Onyx Coffee Lab, Coffee to Art, Dritan Alsela, TALES COFFEE, Coffee Coach, The Right Roast, Otten Coffee

제외: Barista Hustle(유튜브 활동 중단), Hugh Kelly(독립 채널 미확인)

## 다음 단계
1. Supabase 스키마 설계 (claims / topics / channels / videos / claim_relations, 상태·제안자 필드 포함)
2. 승인 큐 화면(`/garden/wiki/review`) 설계 — 영상 단위 일괄 승인 UX 포함
3. 로컬 파이프라인 프로토타입 — 영상 1개로 자막→주장 추출 품질 검증
