/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#effaf3', 100: '#d8f3e1', 200: '#b3e6c6', 300: '#80d2a3', 400: '#4bb67c',
          500: '#279a5f', 600: '#1a7d4c', 700: '#16643f', 800: '#145035', 900: '#11422d', 950: '#082519',
        },
        ink: { 900: '#0a1f16', 800: '#0f2b1f', 700: '#163a2a' },
        harvest: { 50: '#fff8eb', 100: '#feecc7', 400: '#f6b13d', 500: '#ef9a16', 600: '#d47a0c' },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
        display: ['"Plus Jakarta Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16, 40, 28, 0.04), 0 1px 3px rgba(16, 40, 28, 0.06)',
        lift: '0 10px 30px -12px rgba(16, 40, 28, 0.25)',
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(8px)' }, '100%': { opacity: '1', transform: 'none' } },
      },
      animation: { 'fade-up': 'fade-up 0.4s ease-out both' },
    },
  },
  plugins: [],
};
