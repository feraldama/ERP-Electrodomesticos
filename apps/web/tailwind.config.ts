import type { Config } from "tailwindcss";

// Tokens del sistema de diseno (skill ui-ux-pro-max): Data-Dense Dashboard.
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#334155",
          fg: "#ffffff",
        },
        secondary: "#475569",
        accent: {
          DEFAULT: "#059669",
          hover: "#047857",
        },
        background: "#f8fafc",
        foreground: "#0f172a",
        muted: "#f2f3f4",
        border: "#e6e8ea",
        destructive: "#dc2626",
        // Sidebar slate oscuro
        sidebar: {
          DEFAULT: "#1e293b",
          hover: "#334155",
          active: "#0f172a",
          text: "#cbd5e1",
        },
      },
      fontFamily: {
        sans: ["var(--font-fira-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-fira-code)", "ui-monospace", "monospace"],
      },
      boxShadow: {
        sm: "0 1px 2px rgba(0,0,0,0.05)",
        md: "0 4px 6px rgba(0,0,0,0.1)",
        lg: "0 10px 15px rgba(0,0,0,0.1)",
        xl: "0 20px 25px rgba(0,0,0,0.15)",
      },
      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "zoom-in": {
          from: { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          to: { opacity: "1", transform: "translateY(0) scale(1)" },
        },
      },
      animation: {
        "fade-in": "fade-in 150ms ease-out",
        "zoom-in": "zoom-in 180ms ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
