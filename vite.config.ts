import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "/Memo/",
  plugins: [
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["assets/seals/*.png", "assets/seals/*.svg"],
      manifest: {
        name: "ArmyMemo",
        short_name: "ArmyMemo",
        description: "Local-first Army memorandum formatting aid.",
        theme_color: "#234232",
        background_color: "#f3f5f4",
        display: "standalone",
        start_url: "/Memo/",
        icons: [
          {
            src: "assets/icons/icon-192.svg",
            sizes: "192x192",
            type: "image/svg+xml"
          },
          {
            src: "assets/icons/icon-512.svg",
            sizes: "512x512",
            type: "image/svg+xml"
          }
        ]
      },
      workbox: {
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,ico,json}"]
      }
    })
  ]
});
