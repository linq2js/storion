import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      // More specific paths first
      { find: "storion/react", replacement: path.resolve(__dirname, "../storion/src/react/index.ts") },
      { find: "storion", replacement: path.resolve(__dirname, "../storion/src/index.ts") },
    ],
  },
  server: {
    watch: {
      // Watch storion source files outside project root
      ignored: ["!**/packages/storion/src/**"],
    },
    fs: {
      // Allow serving files from storion source
      allow: [".."],
    },
  },
  optimizeDeps: {
    // Exclude storion from pre-bundling so changes are picked up immediately
    exclude: ["storion"],
  },
});

