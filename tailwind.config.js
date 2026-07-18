/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { 900:'#0a0a0c', 850:'#0e0e11', 800:'#141417', 700:'#1c1c21', 600:'#26262c', 500:'#3a3a42' },
        haze: { 400:'#8a8a94', 300:'#a8a8b2', 200:'#c9c9d1' },
        accent: { DEFAULT:'#e8e8ea', soft:'#5b6cff' }
      },
      fontFamily: { sans: ['-apple-system','BlinkMacSystemFont','SF Pro Display','Inter','system-ui','sans-serif'] },
      borderRadius: { xl2: '1.1rem' },
      backdropBlur: { xs: '2px' }
    }
  },
  plugins: []
}
