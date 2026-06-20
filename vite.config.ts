import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Split large, independently-cacheable vendor groups out of the
        // main bundle so they cache across deploys and don't bloat first load.
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (/[\\/](wagmi|viem|@reown|ethers|@coinbase|@walletconnect|ox)[\\/]/.test(id)) return "web3";
          if (/[\\/](recharts|d3-|victory-)/.test(id)) return "charts";
          if (/[\\/]@radix-ui[\\/]/.test(id)) return "radix";
          if (/[\\/]framer-motion[\\/]/.test(id)) return "motion";
        },
      },
    },
  },
  server: {
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
