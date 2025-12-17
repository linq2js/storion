/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      colors: {
        pokemon: {
          red: "#EE1515",
          blue: "#3B4CCA",
          yellow: "#FFDE00",
          gold: "#B3A125",
        },
      },
    },
  },
  plugins: [],
};

