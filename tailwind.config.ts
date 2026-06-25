import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        fg: '#000000',
        bg: '#FFFFFF',
        accent: { DEFAULT: '#0099FF', tint: '#E6F4FF' },
        line: '#E5E5E5',
        gray: {
          100: '#F5F5F5',
          200: '#E5E5E5',
          300: '#C9C9C9',
          400: '#999999',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Pretendard Variable', 'Pretendard', 'sans-serif'],
        display: ['Inter', 'Inter Tight', 'Pretendard', 'sans-serif'],
      },
      borderRadius: {
        pill: '50px',
        xl: '40px',
        card: '16px',
        md: '10px',
      },
      letterSpacing: {
        tightest: '-1.85px',
        tighter: '-1.25px',
        tight: '-0.5px',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.04)',
        pop: '0 2px 8px rgba(0,0,0,0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
