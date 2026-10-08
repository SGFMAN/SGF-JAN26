import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // 5174 is already taken on this machine. Central's Dan page uses this port.
    port: 5176,
    strictPort: true,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        timeout: 120000,
      },
      "/health": {
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
