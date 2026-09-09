-- 웹훅 연결 전에 들어온 3번째 응답(한지우, 2026-09-09 16:27 KST) — 탈리 Submissions 상세에서 옮김.
insert into finance.teaching_survey_responses (store, form_id, submission_id, respondent_name, submitted_at, topics, custom, priorities, note) values
  ('pangyo', 'Bzy5WQ', 'seed-2026-09-09-한지우', '한지우', '2026-09-09 16:27+09',
   '{espresso-dialing,filter-brewing,ek43-grind,latte-art,water-temp,milk-steaming,cupping,milk-alternatives,bean-explaining,quality-check,machine-cleaning,troubleshooting,water-maintenance,bean-recommend,complaint,peak-flow}',
   '{}', '{water-temp,latte-art,cupping}', '머신•그라인더 컨디션에 따른 샷 세팅 보정, 개인별 맛 편차를 줄이는 QC 관리 기준 ...')
on conflict (submission_id) do nothing;
