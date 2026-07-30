import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Next.js/webpack резолвит "@/*" в корень frontend через tsconfig paths,
// но у vitest нет плагина tsconfig-paths — без этого алиаса любой
// компонентный тест, транзитивно импортирующий что-то через "@/lib/...",
// падает с "Cannot find package '@/lib/...'"
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  // vitest 4 транформирует через oxc, а не esbuild — нужно явно переопределить
  // jsx, иначе он наследует jsx:"preserve" из tsconfig.json (там это нужно
  // Next.js), только для .tsx-тестов компонентов (Stage 5.5 integration tests)
  oxc: {
    jsx: { runtime: "automatic" },
  },
  test: {
    exclude: ["node_modules/**", "e2e/**"],
  },
});
