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
          bg: "#000000",
          surface: "#0a0a0a",
          card: "#111111",
          border: "#1a1a1a",
          text: "#f0f0f0",
          muted: "#737373",
          dim: "#525252",
          accent: "#818cf8",
          done: "#34d399",
        },
      },
      fontFamily: {
        sans: [
          "var(--font-dm-sans)",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
      borderRadius: {
        "2.5xl": "20px",
      },
      animation: {
        "glow-pulse": "glow-pulse 2s ease-in-out infinite alternate",
      },
      keyframes: {
        "glow-pulse": {
          "0%": { opacity: "0.4" },
          "100%": { opacity: "0.7" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
