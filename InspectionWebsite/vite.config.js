import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node", // switch to "jsdom" per-file when component tests arrive
    include: ["src/**/*.test.{js,jsx}"],
    // `npm run test:coverage` (needs @vitest/coverage-v8). Scoped to the logic layer.
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.js"],
      exclude: ["src/**/*.test.js"],
      reporter: ["text", "lcov"],
    },
  },
});
