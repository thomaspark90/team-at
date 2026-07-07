-- 송금 요청 — 직원이 영수증/거래명세서 사진을 올리면 AI가 거래처·금액·입금계좌를
-- 추출해 확인 후 등록, 송금 담당자가 대시보드에서 이체 처리. (멱등)
-- Supabase SQL Editor 에 붙여넣고 Run.

-- 거래처 계좌장부 — 명세서에 계좌가 없는 거래처(예: 코카콜라)를 위해
-- 한 번 확인된 계좌를 기억해 다음 업로드 때 자동으로 채운다.
create table if not exists finance.vendor_accounts (
  id             bigserial primary key,
  vendor_name    text not null unique,
  bank           text,
  account_no     text,
  account_holder text,
  updated_at     timestamptz not null default now()
);

create table if not exists finance.transfer_requests (
  id              bigserial primary key,
  created_at      timestamptz not null default now(),
  requester_id    uuid not null references auth.users(id) on delete cascade,
  requester_email text not null,
  vendor_name     text not null,
  doc_date        date,
  amount          numeric not null check (amount > 0),
  items_summary   text,
  bank            text,
  account_no      text,
  account_holder  text,
  memo            text,
  image_path      text,                                   -- Vercel Blob 내부 경로(비공개)
  status          text not null default 'pending' check (status in ('pending','done')),
  done_by         uuid references auth.users(id),
  done_by_email   text,
  done_at         timestamptz
);
create index if not exists transfer_requests_status_idx
  on finance.transfer_requests (status, created_at desc);

alter table finance.vendor_accounts  enable row level security;
alter table finance.transfer_requests enable row level security;

-- 업로드(요청 등록)는 구글 로그인만 하면 가능 — finance 멤버 등록 불필요.
-- 완료 처리(update)는 admin/classifier 만.
drop policy if exists "vendor accounts read"  on finance.vendor_accounts;
drop policy if exists "vendor accounts write" on finance.vendor_accounts;
drop policy if exists "vendor accounts edit"  on finance.vendor_accounts;
create policy "vendor accounts read"  on finance.vendor_accounts for select using (auth.uid() is not null);
create policy "vendor accounts write" on finance.vendor_accounts for insert with check (auth.uid() is not null);
create policy "vendor accounts edit"  on finance.vendor_accounts for update
  using (auth.uid() is not null) with check (auth.uid() is not null);

drop policy if exists "transfer read"   on finance.transfer_requests;
drop policy if exists "transfer insert" on finance.transfer_requests;
drop policy if exists "transfer done"   on finance.transfer_requests;
drop policy if exists "transfer delete" on finance.transfer_requests;
create policy "transfer read" on finance.transfer_requests for select using (auth.uid() is not null);
create policy "transfer insert" on finance.transfer_requests for insert
  with check (auth.uid() = requester_id);
create policy "transfer done" on finance.transfer_requests for update
  using (finance.my_role() in ('admin','classifier'))
  with check (finance.my_role() in ('admin','classifier'));
-- 본인이 올린 대기 건은 본인이 삭제 가능, 스태프는 모두 삭제 가능
create policy "transfer delete" on finance.transfer_requests for delete
  using (
    (status = 'pending' and requester_id = auth.uid())
    or finance.my_role() in ('admin','classifier')
  );
