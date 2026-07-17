// 필터커피 투두 — 가든 설정(/garden/settings)에서 관리하는 간단한 할 일 목록.
export interface GardenTodo {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
  createdBy?: string;
  doneAt?: string;
  doneBy?: string;
}
