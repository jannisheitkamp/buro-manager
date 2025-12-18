/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        // Custom softer gray palette example if needed, but standard tailwind colors are fine for now.
        // We will rely on opacity and blur for the "premium" feel.
      }
    },
  },
  plugins: [],
};
