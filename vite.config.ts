import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { nodePolyfills } from "vite-plugin-node-polyfills";

// Import and apply polyfills
import { applyPolyfills } from "./src/polyfills";

// @ts-ignore process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-ignore process is a nodejs global
const port = process.env.VITE_PORT ? parseInt(process.env.VITE_PORT) : 1420;
// @ts-ignore process is a nodejs global
const hmrPort = process.env.VITE_HMR_PORT
    ? parseInt(process.env.VITE_HMR_PORT)
    : 1421;

// https://vitejs.dev/config/
export default defineConfig(async () => ({
    plugins: [
        react(),
        nodePolyfills({
            include: ["os"],
        }),
    ],
    resolve: {
        alias: {
            path: "path-browserify",
            fs: "fs",
            "@ui": path.resolve(__dirname, "./src/ui"),
            "@core": path.resolve(__dirname, "./src/core"),
            "@": path.resolve(__dirname, "./src"),
        },
    },
    build: {
        target: ["safari15"], // add chrome105 if we add windows support
    },

    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
        port: port,
        strictPort: true,
        host: host || false,
        hmr: host
            ? {
                  protocol: "ws",
                  host,
                  port: hmrPort,
              }
            : undefined,
        watch: {
            // 3. tell vite to ignore watching `src-tauri`
            ignored: ["**/src-tauri/**"],
        },
    },
}));
