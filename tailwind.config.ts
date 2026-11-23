import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        lime: { DEFAULT: '#A4D92D' },
        leaf: { DEFAULT: '#7CC51B', dark: '#286B24', deep: '#19451F', soft: '#EDF6E3' },
        sand: { DEFAULT: '#D9C3A2', soft: '#F3EBDD' },
        paper: '#F8F7F2',
        ink: { DEFAULT: '#191A17', soft: '#55584F', faint: '#8B8E84' },
        line: '#E6E4DA',
        warn: { DEFAULT: '#F08C2E', soft: '#FDEBD8' },
        danger: { DEFAULT: '#E5484D', soft: '#FCE4E4' },
        info: { DEFAULT: '#3B82F6', soft: '#E3EDFD' },
        ai: { DEFAULT: '#8B5CF6', soft: '#EFE9FE' },
      },
      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-body)', 'system-ui', 'sans-serif'],
      },
      borderRadius: { xl: '14px', '2xl': '20px', '3xl': '28px' },
      boxShadow: {
        card: '0 1px 2px rgba(25,26,23,.04), 0 6px 20px rgba(25,26,23,.06)',
        lift: '0 2px 4px rgba(25,26,23,.06), 0 14px 34px rgba(25,26,23,.10)',
      },
      keyframes: {
        pop: { '0%': { transform: 'scale(.92)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        floaty: { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
        rise: { '0%': { transform: 'translateY(8px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
      },
      animation: {
        pop: 'pop .25s ease-out both',
        floaty: 'floaty 4s ease-in-out infinite',
        rise: 'rise .35s ease-out both',
      },
    },
  },
  plugins: [],
} satisfies Config;
