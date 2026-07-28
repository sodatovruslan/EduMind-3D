import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // фирменный акцент EduMind 3D — используем везде вместо голого "blue-500"
        brand: {
          DEFAULT: "#6366F1",
          dark: "#4338CA",
        },
      },
    },
  },
  plugins: [],
};

export default config;
