-- 계정과목 부가세 과세여부 — 대시보드 손익을 공급가액(부가세 순액) 기준으로 계산하기 위함.
-- 과세(vat_taxable=true) 매입/매출만 손익에서 총액÷1.1로 순액 처리. 면세·비대상은 그대로.
-- 멱등: 재실행 안전. 프로덕션 SQL Editor에서 1회 실행.

alter table finance.categories
  add column if not exists vat_taxable boolean not null default true;

-- 면세·비대상 항목을 false로 (F&B 기본값 — 이후 계정과목 관리 화면에서 조정 가능)
update finance.categories set vat_taxable = false
where type in ('non_operating', 'excluded')
   or (type = 'sga' and name in (
        '인건비', '정규직', '단기', '일일용역', '강사료', '퇴직금',
        '보험료', '4대보험', '기타보험',
        '수도',            -- 수도요금 면세 (전기·가스는 과세로 둠)
        '세금과공과',
        '여비교통비',      -- 여객운송 면세·매입세액 불공제 성격
        '잡비'
      ));

-- 나머지(매출 전부, 재료비 전부, 그 외 판관비)는 default true 그대로 = 과세.
-- ⚠️ 실제 매입형태에 따라 조정 필요: 볶은 원두가 아니라 '생두'거나 미가공 농산물(과일 등) 매입이면 해당 재료비를 면세로 토글하세요.
