-- row_date 백필 오탐 정리 — 2026-08-19.
--
-- 앞선 백필이 앞쪽 열을 훑어 날짜를 찾는 방식이라, 우리은행 xls 상단의 안내 문구
-- ("조회기간 : 2025.01.01 ~ 2025.06.30")에서도 날짜를 뽑아 메타 행에 가짜 날짜가 붙었다.
-- 거래 행은 금액 열(찾으신/맡기신)에 숫자가 있으므로, 그렇지 않은 행의 날짜를 지운다.
update finance.raw_rows r
set row_date = null
where r.row_date is not null
  and jsonb_typeof(r.payload) = 'array'
  and not exists (
    select 1
    from unnest(array[r.payload->>4, r.payload->>5]) as amt
    where amt ~ '^[0-9,]+$'
  );
