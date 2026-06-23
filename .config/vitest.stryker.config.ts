// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

import { defineConfig } from "vitest/config";

/**
 * Vitest configuration optimised for Stryker mutation testing.
 *
 * Key differences from the main vitest.config.ts:
 * - Excludes property tests (fast-check): they add significant import overhead
 *   per mutant run (~1.6s) while providing no additional mutant-killing power
 *   beyond what unit + integration tests already cover.
 * - Excludes benchmark files.
 * - No coverage (Stryker handles its own coverage analysis).
 * - No reporters beyond default (Stryker captures output itself).
 */
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    pool: "threads",
    isolate: false,
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
  },
});
