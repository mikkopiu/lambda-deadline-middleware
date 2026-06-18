import { test, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { withLambdaDeadline } from "../../src/context-store.js";

import type { LambdaContextLike } from "../../src/context-store.js";

const context: LambdaContextLike = { getRemainingTimeInMillis: () => 30_000 };

/**
 * Configuration validation rejects negative buffer
 * For any negative number passed as flushBufferMs, the library throws a TypeError at invocation time.
 */
describe("Configuration validation rejects negative buffer", () => {
  test.prop([fc.double({ max: -Number.MIN_VALUE, noNaN: true })], {
    numRuns: 100,
  })(
    "withLambdaDeadline throws TypeError for any negative flushBufferMs",
    async (negativeBuffer) => {
      // oxlint-disable-next-line typescript/require-await -- async stub
      const handler = async () => "ok";
      const wrapped = withLambdaDeadline(handler, { flushBufferMs: negativeBuffer });
      await expect(wrapped({}, context)).rejects.toThrow(TypeError);
    },
  );

  test.prop([fc.integer({ min: -1_000_000, max: -1 })], { numRuns: 100 })(
    "withLambdaDeadline throws TypeError for any negative integer flushBufferMs",
    async (negativeBuffer) => {
      // oxlint-disable-next-line typescript/require-await -- async stub
      const handler = async () => "ok";
      const wrapped = withLambdaDeadline(handler, { flushBufferMs: negativeBuffer });
      await expect(wrapped({}, context)).rejects.toThrow(TypeError);
    },
  );

  test.prop([fc.double({ min: 0, noNaN: true, noDefaultInfinity: true })], { numRuns: 100 })(
    "withLambdaDeadline does NOT throw TypeError for non-negative flushBufferMs",
    async (nonNegativeBuffer) => {
      // oxlint-disable-next-line typescript/require-await -- async stub
      const handler = async () => "ok";
      const wrapped = withLambdaDeadline(handler, { flushBufferMs: nonNegativeBuffer });
      // Should not throw TypeError (may throw DeadlineExceededError if buffer > remaining, but not TypeError)
      const error = await wrapped({}, context).catch((e: unknown) => e);
      expect(error).not.toBeInstanceOf(TypeError);
    },
  );

  test.prop([fc.integer({ min: 0, max: 900_000 })], { numRuns: 100 })(
    "withLambdaDeadline does NOT throw TypeError for non-negative integer flushBufferMs",
    async (nonNegativeBuffer) => {
      // oxlint-disable-next-line typescript/require-await -- async stub
      const handler = async () => "ok";
      const wrapped = withLambdaDeadline(handler, { flushBufferMs: nonNegativeBuffer });
      const error = await wrapped({}, context).catch((e: unknown) => e);
      expect(error).not.toBeInstanceOf(TypeError);
    },
  );
});
