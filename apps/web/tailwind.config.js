/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#0A0F16",
          900: "#0E1520",
          800: "#16202E",
          700: "#223044",
          600: "#34455C",
          500: "#52657C",
          400: "#75879A",
          300: "#A4B1BF",
          200: "#CBD3DB",
          100: "#E6EBEF",
          50: "#F2F5F7",
        },
        paper: "#F5F5F1",
        signal: {
          700: "rgb(var(--signal-700) / <alpha-value>)",
          600: "rgb(var(--signal-600) / <alpha-value>)",
          500: "rgb(var(--signal-500) / <alpha-value>)",
          400: "rgb(var(--signal-400) / <alpha-value>)",
          100: "rgb(var(--signal-100) / <alpha-value>)",
          50: "rgb(var(--signal-50) / <alpha-value>)",
        },
      },
      fontFamily: {
        sans: ["Instrument Sans", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(14,21,32,0.04), 0 1px 3px rgba(14,21,32,0.03)",
        lift: "0 12px 32px -12px rgba(14,21,32,0.28), 0 2px 8px rgba(14,21,32,0.06)",
      },
      keyframes: {
        "slide-in": { from: { transform: "translateX(24px)", opacity: "0" }, to: { transform: "translateX(0)", opacity: "1" } },
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "rise": { from: { transform: "translateY(6px)", opacity: "0" }, to: { transform: "translateY(0)", opacity: "1" } },
      },
      animation: {
        "slide-in": "slide-in 220ms cubic-bezier(0.22,1,0.36,1)",
        "fade-in": "fade-in 180ms ease-out",
        rise: "rise 260ms cubic-bezier(0.22,1,0.36,1)",
      },
    },
  },
  plugins: [],
};
