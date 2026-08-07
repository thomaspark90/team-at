import { gardenTodoRecords } from '@/lib/blob-records';
import { makeTodoHandlers } from '@/lib/todo-route';

// 가든 투두 — 스탭밀 투두 신설로 동작을 공용 핸들러(lib/todo-route)로 옮겼다. 동작 동일.
// 기록별 blob 저장(lib/blob-records) — 두 명이 동시에 추가·토글해도 서로 다른 파일이라 유실이 없다.
export const { GET, POST, DELETE } = makeTodoHandlers(gardenTodoRecords, '가든서비스');
