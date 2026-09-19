import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@backend\/lib\/(.+)\.js$/,
        replacement: path.join(repoRoot, "lib/$1.ts"),
      },
    ],
  },
  test: {
    include: ["src/**/*.test.ts"],
  },
});
