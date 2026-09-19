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
  },
});
