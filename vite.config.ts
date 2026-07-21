import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { proxy: { "/api/runtime": "http://127.0.0.1:4175", "/api/local": "http://127.0.0.1:4175", "/api/replay": "http://127.0.0.1:4175" } },
  build: { sourcemap: false },
});
