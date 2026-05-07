import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Backgrounds
        bg: {
          base: '#0A0A0A',
          surface: '#141414',
          elevated: '#1B1B1B',
          overlay: '#222222',
        },
        // ── Borders
        border: {
          subtle: '#2A2A2A',
          DEFAULT: '#333333',
          strong: '#444444',
        },
        // ── Text
        text: {
          primary: '#F5F5F5',
          secondary: '#9A9A9A',
          muted: '#666666',
          inverse: '#0A0A0A',
        },
        // ── Brand accent (automotive red)
        accent: {
          50: '#fff0f0',
          100: '#ffd6d6',
          200: '#ffadad',
          300: '#ff7575',
          400: '#ff3d3d',
          500: '#E8112D', // primary accent
          600: '#c4001f',
          700: '#a10018',
          800: '#7d0014',
          900: '#5a000e',
        },
        // ── Success
        success: {
          DEFAULT: '#22c55e',
          muted: '#16a34a',
          bg: '#052e16',
        },
        // ── Warning
        warning: {
          DEFAULT: '#f59e0b',
          muted: '#d97706',
          bg: '#1c1006',
        },
        // ── Error
        error: {
          DEFAULT: '#ef4444',
          muted: '#dc2626',
          bg: '#1c0606',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Cal Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        '3xl': '24px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgba(0,0,0,.6), 0 1px 2px -1px rgba(0,0,0,.6)',
        elevated: '0 4px 12px 0 rgba(0,0,0,.8)',
        accent: '0 0 0 1px rgba(232,17,45,.4), 0 4px 16px rgba(232,17,45,.15)',
        glow: '0 0 20px rgba(232,17,45,.25)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.25s ease-out',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { transform: 'translateY(8px)', opacity: '0' }, to: { transform: 'translateY(0)', opacity: '1' } },
      },
    },
  },
  plugins: [],
}

export default config
