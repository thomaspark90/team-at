'use client';

import { useEffect, useState } from 'react';
import GrinderCalibration from '@/components/garden/GrinderCalibration';
import type { GrinderProfiles } from '@/lib/grinder-calibration';

// 가든 대시보드의 운영 섹션 — 그라인더 캘리브레이션.
// 레시피 카드가 필터 레시피 탭으로 이동하면서 대시보드 전용으로 분리.
export default function GardenOps() {
  const [profiles, setProfiles] = useState<GrinderProfiles>({});
  // 첫 응답 전에는 '계산 불가' 안내가 잘못 깜빡이므로 로딩 상태를 구분한다
  const [loaded, setLoaded] = useState(false);

  const refresh = () =>
    fetch('/api/garden-grinders', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : {}))
      .then(setProfiles)
      .finally(() => setLoaded(true));

  useEffect(() => {
    refresh();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <GrinderCalibration profiles={profiles} onSaved={refresh} loading={!loaded} />
    </div>
  );
}
