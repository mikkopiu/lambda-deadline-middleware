// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

import { defineConfig } from "vitest/config";

const isGitHubActions = process.env.GITHUB_ACTIONS === "true";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts", "tests/**/*.property.test.ts"],
    pool: "threads",
    isolate: false,
    fileParallelism: false,
    deps: {
      optimizer: {
        ssr: {
          enabled: true,
          include: [
            "@aws-sdk/client-dynamodb",
            "@aws-sdk/client-s3",
            "@aws-sdk/client-sqs",
            "@smithy/types",
          ],
        },
      },
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/index.ts"],
    },
    reporters: isGitHubActions ? ["default", "github-actions"] : ["default"],
    benchmark: {
      include: ["tests/bench/**/*.bench.ts"],
    },
  },
});
