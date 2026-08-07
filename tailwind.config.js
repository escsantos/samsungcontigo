/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#EAF2FB",
          100: "#CFE2F5",
          200: "#9FC5EB",
          300: "#6FA8E1",
          400: "#4A90D9",
          500: "#2E6DA8",
          600: "#235685",
          700: "#1B4162",
          800: "#132D44",
          900: "#0B1A28"
        },
        canvas: "var(--canvas)",
        surface: "var(--surface)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        line: "var(--line)",
        danger: "#E1614F",
        "danger-soft": "rgba(225,97,79,0.12)",
        success: "#3FA796"
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        sans: ["var(--font-body)", "sans-serif"]
      },
      borderRadius: {
        DEFAULT: "10px"
      }
    }
  },
  plugins: []
};
