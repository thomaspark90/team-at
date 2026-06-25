'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';

const TABS = [
  { href: '/studio', label: 'Staff Meal' },
  { href: '/garden', label: 'Garden Service' },
];

export default function TabNav() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = () => {
    sessionStorage.removeItem('auth');
    router.push('/');
  };

  return (
    <header style={{ backgroundColor: '#FFFFFF', boxShadow: '0 1px 0 #EBEBEB' }}>
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '0 24px',
          height: 58,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <nav style={{ display: 'flex', gap: 4 }}>
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                style={{
                  fontWeight: active ? 700 : 500,
                  fontSize: 14,
                  letterSpacing: '0.02em',
                  color: active ? '#1C1B19' : '#AAAAAA',
                  textDecoration: 'none',
                  padding: '8px 12px',
                  borderRadius: 8,
                  backgroundColor: active ? '#F3F3F3' : 'transparent',
                  transition: 'all 0.15s',
                }}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <button
          onClick={handleLogout}
          style={{
            fontSize: 12,
            color: '#AAAAAA',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          로그아웃
        </button>
      </div>
    </header>
  );
}
