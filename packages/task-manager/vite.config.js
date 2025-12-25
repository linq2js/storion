import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
var __dirname = path.dirname(fileURLToPath(import.meta.url));
// Plugin to watch storion source and trigger HMR
function watchStorion() {
    var storionSrc = path.resolve(__dirname, "../storion/src");
    return {
        name: "watch-storion",
        configureServer: function (server) {
            server.watcher.add(storionSrc);
            server.watcher.on("change", function (file) {
                if (file.startsWith(storionSrc)) {
                    console.log("[storion] ".concat(path.relative(storionSrc, file), " changed, reloading..."));
                    server.ws.send({ type: "full-reload" });
                }
            });
        },
    };
}
export default defineConfig({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    plugins: [react(), watchStorion()],
    base: "/storion/demos/tasks/",
    define: {
        __DEV__: JSON.stringify(true),
    },
    resolve: {
        alias: [
            {
                find: "storion/devtools-panel",
                replacement: path.resolve(__dirname, "../storion/src/devtools-panel/index.ts"),
            },
            {
                find: "storion/devtools",
                replacement: path.resolve(__dirname, "../storion/src/devtools/index.ts"),
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
        port: 5175,
        fs: {
            allow: [".."],
        },
    },
    optimizeDeps: {
        exclude: [
            "storion",
            "storion/react",
            "storion/async",
            "storion/devtools",
            "storion/devtools-panel",
        ],
    },
});
