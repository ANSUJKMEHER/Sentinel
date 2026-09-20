import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base: "./" => relative asset URLs, so the build works from the S3 website
// root (or any subpath) without extra config.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    sourcemap: false,
  },
  server: {
    port: 5173,
    proxy: {
      "/state": "http://127.0.0.1:3001",
      "/advisories": "http://127.0.0.1:3001",
      "/report": "http://127.0.0.1:3001",
    },
  },
});
