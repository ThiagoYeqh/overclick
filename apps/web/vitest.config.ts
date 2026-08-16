import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Every integration test boots a fresh PGlite and replays the whole
    // migration folder. That grows with each migration and blows the 5s
    // default on a loaded machine, so give the boot real room.
    testTimeout: 30_000,
  },
});
