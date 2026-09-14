import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
const base = process.env.BASE_PATH || "/";
export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      injectRegister: false,
      manifest: {
        id: base,
        name: "일상 밖으로 · 카카오뱅크 HR 워크샵",
        short_name: "일상 밖으로",
        lang: "ko",
        description: "함께 떠나는 카카오뱅크 인사팀의 작은 모험",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#faf9f3",
        theme_color: "#f9df38",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      injectManifest: {
        globPatterns: ["**/*.{js,css,html,png,svg,woff2}"],
        maximumFileSizeToCacheInBytes: 4000000,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: [
            "firebase/app",
            "firebase/auth",
            "firebase/firestore",
            "firebase/functions",
          ],
          map: ["leaflet"],
        },
      },
    },
  },
});
