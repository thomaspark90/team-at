import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        positive: 'hsl(var(--number-colored))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      fontFamily: {
        sans: ['Freesentation', 'system-ui', 'sans-serif'],
        serif: ['Freesentation', 'system-ui', 'sans-serif'],
      },
      // 박스·컨테이너 라운드 전 스케일 10px 통일(2026-08-01 대표 지시) — full(원형)만 예외.
      // 개별 컴포넌트가 rounded-md/lg/xl/2xl 무엇을 쓰든 같은 값이 나온다.
      borderRadius: {
        DEFAULT: '10px',
        sm: '10px',
        md: '10px',
        lg: '10px',
        xl: '10px',
        '2xl': '10px',
        '3xl': '10px',
      },
    },
  },
  plugins: [],
};

export default config;
