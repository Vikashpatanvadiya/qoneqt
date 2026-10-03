import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The web app. Static files live in web-public/ (public/ holds the video music and is not part of the site).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  publicDir: "web-public",
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    // Local dev talks to the deployed /api functions.
    proxy: { "/api": { target: process.env.VITE_API_PROXY ?? "https://qoneqt-three.vercel.app", changeOrigin: true } },
  },
});
