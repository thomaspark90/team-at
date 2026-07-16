// 분쇄도 측정 기록 — 언스페셜티 컴퍼스로 측정한 결과(이미지+수치)를 지점·원두·다이얼 단위로 쌓는다.
// 지점 간 환산 산식(grinder-calibration)의 원천 데이터: 같은 원두를 두 지점에서 같은
// 다이얼로 측정해 분포 차이를 비교한다.
import type { StoreId } from './types';

export type RoastLevel = 'light' | 'light-medium' | 'medium' | 'medium-dark' | 'dark';

export const ROAST_LEVELS: { id: RoastLevel; label: string }[] = [
  { id: 'light', label: '라이트' },
  { id: 'light-medium', label: '라이트미디엄' },
  { id: 'medium', label: '미디엄' },
  { id: 'medium-dark', label: '미디엄다크' },
  { id: 'dark', label: '다크' },
];

export const roastLabel = (id: RoastLevel | undefined) =>
  ROAST_LEVELS.find((r) => r.id === id)?.label ?? '';

export interface GrindMeasurement {
  id: string;
  store: StoreId;
  bean: string; // 원두명
  roast?: RoastLevel;
  dial: number; // EK43 다이얼 (0.1 단위)
  imageUrls: string[]; // 컴퍼스 결과 캡처 (Blob URL)
  mean?: number; // 평균 입자 µm (컴퍼스 표기값)
  std?: number; // 표준편차
  fines?: number; // 미분 비율 % (있으면)
  shareUrl?: string; // 컴퍼스 공유 URL
  memo?: string;
  createdAt: string;
  createdBy?: string;
}
