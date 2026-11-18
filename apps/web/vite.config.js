import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Stamps the commit being built into index.html as <meta name="build-commit">.
// The e2e workflow polls a Netlify deploy preview until it serves the PR's latest
// commit. Netlify sets COMMIT_REF during builds; anywhere else the value is "local".
const buildCommit = {
  name: "build-commit",
  transformIndexHtml: () => [
    {
      tag: "meta",
      attrs: { name: "build-commit", content: process.env.COMMIT_REF || "local" },
      injectTo: "head",
    },
  ],
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), buildCommit],
  test: {
    // Component tests ask for a DOM in their first line: // @vitest-environment jsdom
    environment: "node",
    include: ["src/**/*.test.{js,jsx}"],
    // `npm run test:coverage` (needs @vitest/coverage-v8). Scoped to the logic layer.
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.js"],
      // supabase.js only creates the client: there is no logic in it to test.
      exclude: ["src/**/*.test.js", "src/lib/supabase.js"],
      reporter: ["text", "lcov"],
    },
  },
});
