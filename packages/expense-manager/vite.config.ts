import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Plugin to watch storion source and trigger HMR
function watchStorion(): Plugin {
  const storionSrc = path.resolve(__dirname, "../storion/src");

  return {
    name: "watch-storion",
    configureServer(server) {
      // Watch storion source directory
      server.watcher.add(storionSrc);

      // Trigger full reload when storion changes
      server.watcher.on("change", (file) => {
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
  plugins: [react(), watchStorion()],
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
      { find: "@", replacement: "/src" },
    ],
  },
  server: {
    fs: {
      // Allow serving files from storion source
      allow: [".."],
    },
  },
  optimizeDeps: {
    // Exclude storion from pre-bundling so changes are picked up immediately
    exclude: ["storion"],
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
