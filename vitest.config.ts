import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    env: {
      VITE_BLOCKS_API_URL: "https://api.test",
      VITE_BLOCKS_PROJECT_KEY: "test-key",
      VITE_BLOCKS_OIDC_CLIENT_ID: "test-client",
    },
  },
});
