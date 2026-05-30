import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    /** Listen on all interfaces so phones/tablets on the same Wi‑Fi can open `http://<this-PC-LAN-IP>:5173`. */
    host: true,
    fs: {
      allow: [".."],
    },
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/health": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/playground.html": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      "/ws": {
        target: "http://localhost:3001",
        ws: true,
      },
    },
  },
});
