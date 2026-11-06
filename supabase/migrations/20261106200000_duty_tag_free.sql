-- 책임 태그가 schedule_tags 목록으로 바뀌었는데 duty_tag 체크 제약이 매니저·서브 매니저만 허용해 새 태그를 고를 수 없었다(2026-11-06).
alter table finance.schedule_staff drop constraint if exists schedule_staff_duty_tag_check;
-- 편집 창이 임시 키(new_…)를 그대로 보낸 건은 서버 키로 바꾼다
update finance.schedule_tags set key = 'general_manager' where kind = 'duty' and key like 'new_%' and label = '총괄 매니저';
notify pgrst, 'reload schema';
