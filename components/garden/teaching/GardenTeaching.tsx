'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, type TeachingMe } from './types';
import ProfileSetup from './ProfileSetup';
import StaffWishlist from './StaffWishlist';
import ManagerBoard from './ManagerBoard';
import ShiftCalendar from './ShiftCalendar';
import StaffRoster from './StaffRoster';
import SurveyResults from './SurveyResults';

// 교육 탭 — 역할에 따라 화면이 갈린다.
//  · 프로필 없는 구글 계정: 이름·지점 등록(스탭으로 시작)
//  · 스탭: 위시리스트 + 매니저 출근 예정
//  · 매니저·대표: 출근 일정 + 지점 집계 + 교육함 기록
export default function GardenTeaching() {
  const router = useRouter();
  const [me, setMe] = useState<TeachingMe | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setMe(await api<TeachingMe>('/api/garden-teaching'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '불러오지 못했습니다.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // 첫 로그인·초기화 직후엔 비밀번호부터 바꾸게 한다
  useEffect(() => {
    if (me?.profile?.pinResetRequired) router.replace('/account/pin');
  }, [me, router]);

  if (error) return <p className="ta-error text-body">{error}</p>;
  if (!me) return <p className="text-body text-muted-foreground">불러오는 중…</p>;

  if (!me.profile && me.role !== 'admin') return <ProfileSetup onDone={load} />;

  if (me.canManage) {
    // 섹션은 구분선 없이 간격으로만(소프트 UI, 2026-09-09) — 일정 블록은 각각 패널
    return (
      <div className="space-y-14">
        <ShiftCalendar me={me} onChange={load} />
        {/* 지점 근무자 명부 — 로그인 없이 등록, 교육 대상 선택지·세부 정보(배우고 싶은 것·순위·메모)의 원천 */}
        <StaffRoster me={me} onChange={load} />
        <ManagerBoard me={me} />
        {/* 스탭 설문(탈리) 결과 — 웹훅으로 자동 적재·명부 반영. 수동 반영 뒤엔 명부·집계도 다시 읽는다 */}
        <SurveyResults onApplied={load} />
      </div>
    );
  }
  return <StaffWishlist me={me} onChange={load} />;
}
