import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import reactCompiler from "babel-plugin-react-compiler";

// the api wants `Authorization: Bearer <key>` on every route the dashboard reads (security branch).
// keys never go in the browser bundle, so the dev proxy adds them: NIGHTINGALE_WEB_API_KEYS is
// {"alvin":"<secret>","rick":"<secret>"}, picked by the ng_user cookie sign-in sets.
// NIGHTINGALE_WEB_API_KEY is one key for everyone. neither set = the api's insecure drill mode
const webKeys: Record<string, string> = (() => {
  const raw = process.env.NIGHTINGALE_WEB_API_KEYS;
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    throw new Error('NIGHTINGALE_WEB_API_KEYS must be JSON like {"alvin":"<secret>"}');
  }
})();
const sharedKey = process.env.NIGHTINGALE_WEB_API_KEY;
const secured = Object.keys(webKeys).length > 0 || Boolean(sharedKey);

function keyFor(cookieHeader: string | undefined): string | undefined {
  const user = /(?:^|;\s*)ng_user=([^;]+)/.exec(cookieHeader ?? "")?.[1];
  return (user && webKeys[decodeURIComponent(user)]) || sharedKey;
}

// https://vite.dev/config/
export default defineConfig({
  // the "fictional drill data" badge shows when the dashboard has no keys, i.e. the api is in insecure dev mode
  define: { __NG_SECURED__: JSON.stringify(secured) },
  plugins: [
    react({
      babel: {
        // imported directly so babel doesn't resolve the plugin from the server's cwd
        plugins: [[reactCompiler, {}]],
      },
    }),
  ],
  optimizeDeps: {
    // pre-bundle the compiler runtime with react, otherwise vite finds it late, re-optimizes,
    // and the first load briefly runs two copies of react
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
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq, req) => {
            const key = keyFor(req.headers.cookie);
            if (key) proxyReq.setHeader("authorization", `Bearer ${key}`);
            // the api doesn't need our cookies
            proxyReq.removeHeader("cookie");
          });
        },
      },
    },
  },
});
