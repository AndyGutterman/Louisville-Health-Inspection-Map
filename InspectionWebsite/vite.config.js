import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node", // switch to "jsdom" per-file when component tests arrive
    include: ["src/**/*.test.{js,jsx}"],
  },
});