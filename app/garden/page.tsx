'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import TabNav from '@/components/TabNav';
import GardenService from '@/components/garden/GardenService';

export default function GardenPage() {
  const router = useRouter();

  useEffect(() => {
    if (sessionStorage.getItem('auth') !== 'ok') router.replace('/');
  }, [router]);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#FFFFFF',
        fontFamily: "'Pretendard Variable','Pretendard',sans-serif",
        color: '#1C1B19',
      }}
    >
      <TabNav />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 24px' }}>
        <GardenService />
      </div>
    </div>
  );
}
