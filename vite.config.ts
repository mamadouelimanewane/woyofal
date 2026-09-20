import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5180, proxy: { "/api": "http://localhost:3001" } },
  test: { include: ["src/**/*.test.ts", "server/**/*.test.ts"], testTimeout: 30000, hookTimeout: 60000 },
} as any);
