/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'mana-blue': '#4a90d9',
        'pitch-red': '#d94a4a',
        'gold': '#ffd700',
        'card-bg': '#2a2a3a',
        'board-bg': '#1a1a2a',
        'shop-bg': '#252535',
      }
    },
  },
  plugins: [],
}
