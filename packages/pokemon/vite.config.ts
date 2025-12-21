import { defineConfig } from "vite";
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
      server.watcher.add(storionSrc);
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
  resolve: {
    alias: [
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
    port: 5175,
    fs: {
      allow: [".."],
    },
  },
  optimizeDeps: {
    exclude: ["storion"],
  },
});

