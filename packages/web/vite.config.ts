import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import reactCompiler from "babel-plugin-react-compiler";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        // Imported directly so Babel does not resolve the plugin from the server's cwd.
        plugins: [[reactCompiler, {}]],
      },
    }),
  ],
  optimizeDeps: {
    // Pre-bundle the compiler runtime with React up front, otherwise Vite discovers it
    // late, re-optimizes, and the first load briefly runs two copies of React.
    include: ["react/compiler-runtime"],
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // the api (packages/api) on its default port; `/api/dev/sessions` → `:8787/dev/sessions`
      "/api": {
        target: process.env.NIGHTINGALE_API_URL ?? "http://localhost:8787",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
