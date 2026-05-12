'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import PasswordGate from '@/components/PasswordGate';

export default function Home() {
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('auth') === 'ok') {
      router.replace('/studio');
    } else {
      setReady(true);
    }
  }, [router]);

  if (!ready) return null;
  return <PasswordGate />;
}
