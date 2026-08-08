// 리뷰 답글 파이프라인 공용 상수 — 서버(queue·cancel)와 화면(ReviewInbox)이 같은 값을 쓴다.
// 승인 후 게시까지의 유예: 이 시간 안에만 취소·재선택할 수 있고,
// 게시기는 이 시간이 지난 승인 건만 가져간다. (한쪽만 바꾸면 화면의
// "HH:MM 이후 게시 예정" 표기와 실제 게시 시각이 어긋나므로 반드시 여기서만 수정)
export const REVIEW_POST_GRACE_MS = 60 * 60 * 1000;

// 미처리 탭에 보이는 상태 — 수집됨·초안 대기·게시 대기 (목록 API와 인박스가 공유)
export const REVIEW_OPEN_STATUSES = ['new', 'drafted', 'approved'];

// 네비 배지에 세는 상태 — 매니저 액션이 필요한 것만. approved는 자동 게시 대기라 제외
export const REVIEW_ACTION_STATUSES = ['new', 'drafted'];

// 게시 실패 최대 재시도 — 넘으면 게시기가 더 가져가지 않고, 매니저가 취소해 정리한다
export const REVIEW_POST_MAX_ATTEMPTS = 5;

// 인박스에서 리뷰를 처리하면 쏘는 브라우저 이벤트 — GardenNav가 듣고 배지를 갱신한다
export const REVIEWS_CHANGED_EVENT = 'garden-reviews-changed';
