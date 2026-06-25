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
    <header style={{ backgroundColor: '#FFFFFF', borderBottom: '1px solid #E5E5E5' }}>
      <div
        style={{
          maxWidth: 1100,
          margin: '0 auto',
          padding: '0 24px',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 24,
        }}
      >
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.5px', color: '#000000', flexShrink: 0 }}>
          team-at
        </span>
        <nav style={{ display: 'flex', gap: 4, flex: 1 }}>
          {TABS.map((tab) => {
            const active = pathname === tab.href;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                style={{
                  fontWeight: active ? 600 : 500,
                  fontSize: 14,
                  letterSpacing: '-0.2px',
                  color: active ? '#FFFFFF' : '#999999',
                  textDecoration: 'none',
                  padding: '8px 16px',
                  borderRadius: 50,
                  backgroundColor: active ? '#000000' : 'transparent',
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
            color: '#999999',
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
