import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Separate from vite.config.ts (dev server) since the test environment needs
// jsdom + globals that the dev/build config doesn't.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
  },
});
