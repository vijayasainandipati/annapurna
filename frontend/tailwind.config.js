/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        annapurna: {
          terracotta: '#C45C26',
          'terracotta-light': '#E07A3D',
          'terracotta-dark': '#963E12',
          brass: '#C9A227',
          'brass-light': '#E5BE45',
          'brass-dark': '#9A7814',
          cream: '#FDF6E9',
          'cream-paper': '#FFFBF5',
          'cream-border': '#EADBCE',
          ink: '#2C2A26',
          'ink-muted': '#6B665E',
          'ink-faint': '#9E988D',
          green: '#2E7D32',
          red: '#C62828',
          leaf: '#4E8A3E'
        }
      },
      fontFamily: {
        serif: ['Georgia', 'Cambria', 'serif'],
        sans: ['system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      boxShadow: {
        'warm': '0 4px 20px -2px rgba(196, 92, 38, 0.08), 0 2px 6px -1px rgba(44, 42, 38, 0.04)',
        'warm-hover': '0 8px 30px -4px rgba(196, 92, 38, 0.14), 0 4px 10px -2px rgba(44, 42, 38, 0.06)',
      }
    },
  },
  plugins: [],
}
