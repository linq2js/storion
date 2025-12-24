import { defineConfig } from "vitest/config";
import type { ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Plugin to watch storion source and trigger HMR
function watchStorion() {
  const storionSrc = path.resolve(__dirname, "../storion/src");

  return {
    name: "watch-storion",
    configureServer(server: ViteDevServer) {
      // Watch storion source directory
      server.watcher.add(storionSrc);

      // Trigger full reload when storion changes
      server.watcher.on("change", (file: string) => {
        if (file.startsWith(storionSrc)) {
          console.log(
            `[storion] ${path.relative(storionSrc, file)} changed, reloading...`
          );
          server.ws.send({ type: "full-reload" });
        }
      });
    },
  };
}

export default defineConfig({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plugins: [react(), watchStorion()] as any,
  define: {
    __DEV__: JSON.stringify(true),
  },
  resolve: {
    alias: [
      // More specific paths first
      {
        find: "storion/devtools-panel",
        replacement: path.resolve(
          __dirname,
          "../storion/src/devtools-panel/index.ts"
        ),
      },
      {
        find: "storion/devtools",
        replacement: path.resolve(
          __dirname,
          "../storion/src/devtools/index.ts"
        ),
      },
      {
        find: "storion/persist",
        replacement: path.resolve(__dirname, "../storion/src/persist/index.ts"),
      },
      {
        find: "storion/network",
        replacement: path.resolve(__dirname, "../storion/src/network/index.ts"),
      },
      {
        find: "storion/async",
        replacement: path.resolve(__dirname, "../storion/src/async/index.ts"),
      },
      {
        find: "storion/react",
        replacement: path.resolve(__dirname, "../storion/src/react/index.ts"),
      },
      {
        find: "storion",
        replacement: path.resolve(__dirname, "../storion/src/index.ts"),
      },
      { find: "@", replacement: path.resolve(__dirname, "src") },
    ],
  },
  server: {
    port: 5174,
    fs: {
      // Allow serving files from storion source
      allow: [".."],
    },
  },
  optimizeDeps: {
    // Exclude storion from pre-bundling so changes are picked up immediately
    exclude: [
      "storion",
      "storion/react",
      "storion/async",
      "storion/devtools",
      "storion/devtools-panel",
      "storion/persist",
      "storion/network",
    ],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
