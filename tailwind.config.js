/** @type {import('tailwindcss').Config} */

// Büro Manager 2.0 – Design-Tokens
// "gray" ist ein leicht grün getöntes Neutral (Papier → Tinte),
// "indigo" wird zur Markenfarbe Petrol umgedeutet, damit alle
// bestehenden Klassen automatisch im neuen System landen.
const neutral = {
  50: '#F5F6F3',
  100: '#ECEEEA',
  200: '#DFE3DD',
  300: '#C6CCC5',
  400: '#9AA39C',
  500: '#6E7872',
  600: '#535D58',
  700: '#3A4441',
  800: '#1F2A2A',
  900: '#141C1D',
  950: '#0C1213',
};

const petrol = {
  50: '#EEF7F6',
  100: '#D3EBE9',
  200: '#A8D6D2',
  300: '#72BAB5',
  400: '#3F9C97',
  500: '#22807C',
  600: '#146A68',
  700: '#125655',
  800: '#124546',
  900: '#123A3B',
  950: '#072223',
};

const amber = {
  50: '#FEF7EC',
  100: '#FCEBCF',
  200: '#F9D59C',
  300: '#F5BC66',
  400: '#F2A541',
  500: '#E08A1E',
  600: '#C16C14',
  700: '#9C5214',
  800: '#7E4217',
  900: '#683716',
  950: '#3B1B08',
};

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        gray: neutral,
        slate: neutral,
        indigo: petrol,
        violet: petrol,
        purple: petrol,
        brand: petrol,
        amber,
        ink: '#14212B',
        paper: '#F5F6F3',
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Geist', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        // Klare Hierarchie statt überall "rounded-3xl"
        md: '0.375rem',
        lg: '0.5rem',
        xl: '0.625rem',
        '2xl': '0.75rem',
        '3xl': '0.875rem',
      },
      boxShadow: {
        sm: '0 1px 0 rgba(20, 33, 43, 0.04)',
        DEFAULT: '0 1px 2px rgba(20, 33, 43, 0.06)',
        md: '0 4px 12px -4px rgba(20, 33, 43, 0.10)',
        lg: '0 12px 32px -12px rgba(20, 33, 43, 0.18)',
        xl: '0 20px 48px -16px rgba(20, 33, 43, 0.24)',
        '2xl': '0 28px 64px -20px rgba(20, 33, 43, 0.30)',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'pop-in': {
          from: { opacity: '0', transform: 'translateY(4px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 150ms ease-out',
        'pop-in': 'pop-in 180ms cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
    },
  },
  plugins: [],
};
