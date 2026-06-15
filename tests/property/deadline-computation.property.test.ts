import type { FinalizeHandlerArguments, FinalizeHandlerOutput } from "@smithy/types";

import { test, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { run } from "../../src/context-store.js";
import { DeadlineExceededError } from "../../src/error.js";
import { deadlineMiddleware } from "../../src/middleware.js";

/**
 * Helper to extract the middleware handler function from the Pluggable.
 */
function extractHandler(options?: { flushBufferMs?: number }) {
  const pluggable = deadlineMiddleware(options);
  let registeredFn: unknown;
  const stack = {
    add(fn: unknown) {
      registeredFn = fn;
    },
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- minimal mock
  pluggable.applyToStack(stack as never);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- we know the shape from the implementation
  return registeredFn as (
    next: (args: FinalizeHandlerArguments<object>) => Promise<FinalizeHandlerOutput<object>>,
    context: object,
  ) => (args: FinalizeHandlerArguments<object>) => Promise<FinalizeHandlerOutput<object>>;
}

const args: FinalizeHandlerArguments<object> = {
  input: {},
  request: { method: "POST", hostname: "localhost", path: "/" },
};

/**
 * Insufficient time produces immediate abort
 * For any remaining time R and flush buffer B where R ≤ B, the middleware
 * immediately produces a DeadlineExceededError without dispatching an HTTP request.
 */
describe("Insufficient time produces immediate abort", () => {
  test.prop([fc.integer({ min: 0, max: 900_000 }), fc.integer({ min: 0, max: 900_000 })], {
    numRuns: 100,
  })(
    "middleware throws DeadlineExceededError when remaining <= buffer",
    async (remaining, buffer) => {
      fc.pre(remaining <= buffer);

      const middleware = extractHandler({ flushBufferMs: buffer });

      let nextCalled = false;
      /* oxlint-disable typescript/require-await -- async stub */
      const next = async () => {
        nextCalled = true;
        return { response: {} as object, output: {} as object };
      };
      /* oxlint-enable typescript/require-await */

      const handler = middleware(next, {});

      const error = await run({ getRemainingTimeInMillis: () => remaining }, async () =>
        handler(args),
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DeadlineExceededError);
      expect(nextCalled).toBe(false);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowing after instanceof check above
      const dee = error as DeadlineExceededError;
      expect(dee.remainingMs).toBe(remaining);
      expect(dee.flushBufferMs).toBe(buffer);
    },
  );

  test.prop([fc.integer({ min: 0, max: 900_000 })], { numRuns: 100 })(
    "middleware throws DeadlineExceededError when remaining === buffer (exactly zero deadline)",
    async (value) => {
      const middleware = extractHandler({ flushBufferMs: value });

      /* oxlint-disable typescript/require-await -- async stub */
      const next = async () => ({
        response: {} as object,
        output: {} as object,
      });
      /* oxlint-enable typescript/require-await */

      const handler = middleware(next, {});

      const error = await run({ getRemainingTimeInMillis: () => value }, async () =>
        handler(args),
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(DeadlineExceededError);
    },
  );
});
