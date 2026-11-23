// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        devOptions: { enabled: false },
        filename: "sw.js",
        outDir: "dist/client",
        manifest: {
          name: "Evolution Chess",
          short_name: "Evolution Chess",
          lang: "es",
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#111512",
          theme_color: "#111512",
          icons: [{ src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,wasm,png,svg,ttf,woff2,ini,txt}"],
          maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
          cleanupOutdatedCaches: true,
          navigateFallback: null,
          runtimeCaching: [
            {
              // Videos: full 200 responses are cached (offline.ts fetches them whole);
              // the player's Range requests are then answered with 206 slices from cache.
              urlPattern: ({ url }) => url.pathname.startsWith("/videos/") && url.pathname.endsWith(".mp4"),
              handler: "CacheFirst",
              options: {
                cacheName: "ec-videos-v1",
                rangeRequests: true,
                cacheableResponse: { statuses: [200], headers: { "content-type": "video/mp4" } },
              },
            },
            {
              urlPattern: ({ request, url }) =>
                (request.mode === "navigate" || (request.destination === "" && url.pathname === "/")) &&
                !url.pathname.startsWith("/~oauth"),
              handler: "NetworkFirst",
              options: { cacheName: "ec-pages", networkTimeoutSeconds: 4 },
            },
          ],
        },
      }),
    ],
  },
});
