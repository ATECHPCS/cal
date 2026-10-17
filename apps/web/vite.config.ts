import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".");
  return {
    // Playwright specs live in e2e/ — vitest runs only src.
    test: { exclude: ["e2e/**", "node_modules/**", "android/**"] },
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: "autoUpdate",
        includeAssets: ["favicon.svg"],
        manifest: {
          name: "Cal",
          short_name: "Cal",
          description: "Self-hosted minimal planner",
          theme_color: "#151513",
          background_color: "#151513",
          display: "standalone",
          start_url: "/",
          share_target: {
            action: "/share",
            method: "GET",
            enctype: "application/x-www-form-urlencoded",
            params: { title: "title", text: "text", url: "url" }
          },
          icons: [
            { src: "/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
            { src: "/pwa-512.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }
          ]
        },
        workbox: {
          importScripts: ["/sw-push.js"],
          // Never serve the app shell for API navigations: OAuth callbacks
          // (/api/google/callback), file shares and ICS exports are top-level
          // navigations that must reach the server, not the cached index.html.
          navigateFallbackDenylist: [/^\/api\//],
          runtimeCaching: [
            {
              urlPattern: ({ url }) => url.pathname.startsWith("/api/entries") || url.pathname.startsWith("/api/holidays"),
              handler: "NetworkFirst",
              options: { cacheName: "cal-api" }
            }
          ]
        }
      })
    ],
    server: {
      proxy: {
        "/api": env.VITE_API_ORIGIN ?? "http://localhost:8082"
      }
    }
  };
});
