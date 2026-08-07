import { staffmealTodoRecords } from '@/lib/blob-records';
import { makeTodoHandlers } from '@/lib/todo-route';

// 스탭밀 투두 — 가든 투두와 동일한 공용 핸들러(lib/todo-route), 컬렉션·로그 라벨만 다르다.
// 섹션 권한: sectionsForApiPath 가 studio 로 매핑 — 스탭밀 화면 접근자만 호출할 수 있다.
export const { GET, POST, DELETE } = makeTodoHandlers(staffmealTodoRecords, '스탭밀');
