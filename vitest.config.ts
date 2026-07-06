import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    exclude: ["**/exports/**", "**/node_modules/**", "**/tests/playwright/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      // `server-only` is a Next.js build-time poison pill that throws at
      // import time under vitest (no `react-server` condition). Alias it to
      // an empty module so unit tests can import server-entrypoint modules.
      "server-only": path.resolve(
        __dirname,
        "tests/helpers/server-only-stub.ts"
      ),
    },
  },
});
