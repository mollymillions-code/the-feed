import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        feed: {
          bg: "#0C0A09",
          surface: "#141211",
          card: "#1A1816",
          border: "#262320",
          text: "#F5F0EB",
          muted: "#8A8078",
          dim: "#5C544D",
          accent: "#D4A04B",
          "accent-soft": "#C07A4B",
          done: "#7BA67E",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-jakarta)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
        serif: [
          "var(--font-serif)",
          "Georgia",
          "Times New Roman",
          "serif",
        ],
      },
      borderRadius: {
        "2.5xl": "20px",
      },
      animation: {
        "glow-pulse": "glow-pulse 3s ease-in-out infinite alternate",
      },
      keyframes: {
        "glow-pulse": {
          "0%": { opacity: "0.3" },
          "100%": { opacity: "0.6" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
