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
              urlPattern: ({ request, url }) =>
                request.mode === "navigate" && !url.pathname.startsWith("/~oauth"),
              handler: "NetworkFirst",
              options: { cacheName: "ec-pages", networkTimeoutSeconds: 4 },
            },
          ],
        },
      }),
    ],
  },
});
