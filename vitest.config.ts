import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  // tsconfig keeps jsx "preserve" for Vite's React plugin; tests that render components need it compiled.
  oxc: { jsx: { runtime: "automatic" } },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  test: {
    environment: "node",
    // Modules that import the db handle need a URL at import time; a localhost URL
    // selects the plain pg driver, which does not connect until first query.
    env: { DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://localhost:5432/spacechild_test" },
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", "dist/**", ".cache/**"],
  },
});
