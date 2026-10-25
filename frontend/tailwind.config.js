/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f1f8f2', 100: '#dcefdf', 200: '#bbdfc2', 300: '#8ec69b', 400: '#5ea770',
          500: '#3d8a52', 600: '#2d6f40', 700: '#255935', 800: '#20472d', 900: '#1b3b26',
        },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
};
