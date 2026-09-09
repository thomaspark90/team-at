-- 간편 계정 가입 신청 때 본인이 적는 연락용 이메일(선택) — 2026-09-09 대표 결정.
-- 간편 계정의 auth 이메일은 내부용 가짜 주소라 메일함이 없으므로, 승인 알림은 이 주소로 보낸다.
-- 승인 화면(설정 > 간편 계정 > 승인 대기)에도 표시해 동명이인 구분에 쓴다.

alter table finance.profiles
  add column if not exists contact_email text;

comment on column finance.profiles.contact_email is '연락용 이메일(선택, 가입 신청 때 본인 기재). 승인 알림 수신처.';
