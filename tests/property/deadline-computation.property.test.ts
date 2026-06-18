import { test, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { withLambdaDeadline } from "../../src/context-store.js";
import { DeadlineExceededError } from "../../src/error.js";

import type { LambdaContextLike } from "../../src/context-store.js";

/**
 * Insufficient time produces immediate abort
 * For any remaining time R and flush buffer B where R ≤ B, withLambdaDeadline
 * immediately throws a DeadlineExceededError without calling the handler.
 */
describe("Insufficient time produces immediate abort", () => {
  test.prop([fc.integer({ min: 0, max: 900_000 }), fc.integer({ min: 0, max: 900_000 })], {
    numRuns: 100,
  })(
    "withLambdaDeadline throws DeadlineExceededError when remaining <= buffer",
    async (remaining, buffer) => {
      fc.pre(remaining <= buffer);

      let handlerCalled = false;
      // oxlint-disable-next-line typescript/require-await -- async stub
      const handler = async () => {
        handlerCalled = true;
        return "should not reach";
      };

      const wrapped = withLambdaDeadline(handler, { flushBufferMs: buffer });
      const context: LambdaContextLike = { getRemainingTimeInMillis: () => remaining };

      const error = await wrapped({}, context).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DeadlineExceededError);
      expect(handlerCalled).toBe(false);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowing after instanceof check above
      const dee = error as DeadlineExceededError;
      expect(dee.remainingMs).toBe(remaining);
      expect(dee.flushBufferMs).toBe(buffer);
    },
  );

  test.prop([fc.integer({ min: 0, max: 900_000 })], { numRuns: 100 })(
    "withLambdaDeadline throws DeadlineExceededError when remaining === buffer (exactly zero deadline)",
    async (value) => {
      // oxlint-disable-next-line typescript/require-await -- async stub
      const handler = async () => "should not reach";

      const wrapped = withLambdaDeadline(handler, { flushBufferMs: value });
      const context: LambdaContextLike = { getRemainingTimeInMillis: () => value };

      const error = await wrapped({}, context).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DeadlineExceededError);
    },
  );
});
