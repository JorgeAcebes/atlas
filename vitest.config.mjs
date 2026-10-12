import { defineConfig } from "vitest/config";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// "Tests profundos": se excluyen del bucle rápido habitual de desarrollo
// y solo se ejecutan cuando se especifica 'deep' (npm run test:deep o npm run verify pre-push)
const isDeepExplicit =
  process.argv.some((arg) => arg.includes("deep")) || process.env.RUN_DEEP_TESTS === "true";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    testTimeout: 15000,
    include: ["tests/**/*.{test,spec}.{ts,tsx}"],
    exclude: isDeepExplicit ? [] : ["tests/deep/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
