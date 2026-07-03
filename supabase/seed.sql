-- Garden Service 재무 ERP — 계정과목 seed
-- schema.sql 실행 후 SQL Editor 에 붙여넣어 실행.
-- 2계층: 대분류(인건비·수도광열비·보험료·지급수수료·자본적지출) + 소분류(parent_id).

-- 매출
insert into finance.categories (type,name,sort) values
 ('revenue','카드매출',10),
 ('revenue','간편결제매출',20),
 ('revenue','배달매출',30),
 ('revenue','기타매출',40),
 ('revenue','현금매출',50);

-- 매출원가(재료비)
insert into finance.categories (type,name,sort) values
 ('cogs','원두',10),
 ('cogs','우유·유제품',20),
 ('cogs','부자재',30),
 ('cogs','포장재',40),
 ('cogs','상품매입',50);

-- 판관비 — 대분류(그룹)
insert into finance.categories (type,name,sort) values
 ('sga','인건비',10),
 ('sga','수도광열비',60),
 ('sga','보험료',80),
 ('sga','지급수수료',120);

-- 판관비 — 잎(대분류 없음)
insert into finance.categories (type,name,sort) values
 ('sga','임대료',20),
 ('sga','관리비',30),
 ('sga','통신비',70),
 ('sga','광고비',90),
 ('sga','판매촉진비',100),
 ('sga','소모품비',110),
 ('sga','렌탈료',115),
 ('sga','복리후생비',130),
 ('sga','수선비',140),
 ('sga','세금과공과',150),
 ('sga','운반비',160),
 ('sga','교육훈련비',170),
 ('sga','여비교통비',180),
 ('sga','도서인쇄비',190),
 ('sga','잡비',200);

-- 판관비 — 소분류(parent_id 연결)
insert into finance.categories (type,name,parent_id,sort)
select 'sga', v.name, p.id, v.sort
from (values ('정규직',11),('단기',12),('일일용역',13),('강사료',14),('퇴직금',15)) as v(name,sort),
     finance.categories p where p.type='sga' and p.name='인건비';

insert into finance.categories (type,name,parent_id,sort)
select 'sga', v.name, p.id, v.sort
from (values ('전기',61),('가스',62),('수도',63)) as v(name,sort),
     finance.categories p where p.type='sga' and p.name='수도광열비';

insert into finance.categories (type,name,parent_id,sort)
select 'sga', v.name, p.id, v.sort
from (values ('4대보험',81),('기타보험',82)) as v(name,sort),
     finance.categories p where p.type='sga' and p.name='보험료';

insert into finance.categories (type,name,parent_id,sort)
select 'sga', v.name, p.id, v.sort
from (values ('카드수수료',121),('배달앱수수료',122),('PG·VAN수수료',123),('로열티',124),('세무기장료',125)) as v(name,sort),
     finance.categories p where p.type='sga' and p.name='지급수수료';

-- 영업외
insert into finance.categories (type,name,sort) values
 ('non_operating','이자수익',10),
 ('non_operating','이자비용',20),
 ('non_operating','정부지원금·보조금',30),
 ('non_operating','유형자산처분손익',40),
 ('non_operating','잡손익',50);

-- 손익 제외(자산·내부이체) — in_pnl=false
insert into finance.categories (type,name,in_pnl,sort) values
 ('excluded','자본적지출',false,10),
 ('excluded','보증금',false,20),
 ('excluded','내부이체',false,30);

insert into finance.categories (type,name,parent_id,in_pnl,sort)
select 'excluded', v.name, p.id, false, v.sort
from (values ('인테리어',11),('설비',12),('초기투자',13)) as v(name,sort),
     finance.categories p where p.type='excluded' and p.name='자본적지출';
