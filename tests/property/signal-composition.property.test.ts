import type { FinalizeHandlerArguments, FinalizeHandlerOutput } from "@smithy/types";

import { test, fc } from "@fast-check/vitest";
import { describe, expect, vi, beforeEach, afterEach } from "vitest";

import { run } from "../../src/context-store.js";
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

/**
 * Timer cleanup on completion
 * For any request that completes (success, error, or abort), the associated
 * `setTimeout` is cleared, and no timer reference prevents garbage
 * collection of request-scoped objects.
 */
describe("Timer cleanup on completion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test.prop([fc.integer({ min: 1, max: 900_000 })], { numRuns: 100 })(
    "after successful request, no lingering timers remain",
    async (remaining) => {
      const flushBufferMs = Math.max(0, Math.floor(remaining / 2));
      const middleware = extractHandler({ flushBufferMs });

      const args: FinalizeHandlerArguments<object> = {
        input: {},
        request: { method: "POST", hostname: "localhost", path: "/" },
      };

      /* oxlint-disable typescript/require-await -- async stub */
      const next = async () => ({
        response: { statusCode: 200 } as object,
        output: {} as object,
      });
      /* oxlint-enable typescript/require-await */

      const handler = middleware(next, {});

      // Only run when there's actually enough time for a deadline (remaining > flushBuffer)
      fc.pre(remaining > flushBufferMs);

      await run({ getRemainingTimeInMillis: () => remaining }, async () => handler(args));

      expect(vi.getTimerCount()).toBe(0);
    },
  );

  test.prop([fc.integer({ min: 1, max: 900_000 })], { numRuns: 100 })(
    "after next() throws, no lingering timers remain",
    async (remaining) => {
      const flushBufferMs = Math.max(0, Math.floor(remaining / 2));
      const middleware = extractHandler({ flushBufferMs });

      const args: FinalizeHandlerArguments<object> = {
        input: {},
        request: { method: "POST", hostname: "localhost", path: "/" },
      };

      /* oxlint-disable typescript/require-await -- async stub */
      const next = async () => {
        throw new Error("downstream error");
      };
      /* oxlint-enable typescript/require-await */

      const handler = middleware(next, {});

      fc.pre(remaining > flushBufferMs);

      await run({ getRemainingTimeInMillis: () => remaining }, async () => handler(args)).catch(
        () => {},
      );

      expect(vi.getTimerCount()).toBe(0);
    },
  );
});

/**
 * No-op outside Lambda context
 * For any SDK request dispatched when the context store has no stored context,
 * the middleware passes the request through unmodified — the output of calling
 * `next(args)` is identical to calling next without the middleware present.
 */
describe("No-op outside Lambda context", () => {
  test.prop(
    [
      fc.record({
        input: fc.record({
          hostname: fc.string({ minLength: 1, maxLength: 50 }),
          path: fc.string({ minLength: 1, maxLength: 100 }),
        }),
        request: fc.record({
          method: fc.constantFrom("GET", "POST", "PUT", "DELETE"),
          hostname: fc.string({ minLength: 1, maxLength: 50 }),
          path: fc.string({ minLength: 1, maxLength: 100 }),
        }),
      }),
      fc.anything(),
    ],
    { numRuns: 100 },
  )(
    "middleware passes args through unmodified and returns next's result when no context is stored",
    async (args, nextResult) => {
      const middleware = extractHandler();
      const receivedArgs: unknown[] = [];
      const expectedOutput: FinalizeHandlerOutput<object> = {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fc.anything() produces unknown; casting to satisfy Smithy output shape
        response: nextResult as object,
        output: {} as object,
      };

      /* oxlint-disable typescript/require-await -- async stub satisfies FinalizeHandler without needing await */
      const next = async (
        receivedArg: FinalizeHandlerArguments<object>,
      ): Promise<FinalizeHandlerOutput<object>> => {
        receivedArgs.push(receivedArg);
        return expectedOutput;
      };
      /* oxlint-enable typescript/require-await */

      const handler = middleware(next, {});
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fc.record() output matches FinalizeHandlerArguments shape
      const result = await handler(args as FinalizeHandlerArguments<object>);

      expect(receivedArgs).toHaveLength(1);
      expect(receivedArgs[0]).toBe(args);
      expect(result).toBe(expectedOutput);
    },
  );

  test.prop(
    [
      fc.integer({ min: 0, max: 900_000 }),
      fc.record({
        input: fc.record({
          key: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        request: fc.record({
          method: fc.constantFrom("GET", "POST"),
        }),
      }),
    ],
    { numRuns: 100 },
  )(
    "middleware is a no-op regardless of flushBufferMs configuration when no context is stored",
    async (bufferValue, args) => {
      const middleware = extractHandler({ flushBufferMs: bufferValue });

      const expectedOutput: FinalizeHandlerOutput<object> = {
        response: { status: 200 } as object,
        output: {} as object,
      };

      let nextCalled = false;
      let receivedArg: unknown;

      /* oxlint-disable typescript/require-await -- async stub satisfies FinalizeHandler without needing await */
      const next = async (
        arg: FinalizeHandlerArguments<object>,
      ): Promise<FinalizeHandlerOutput<object>> => {
        nextCalled = true;
        receivedArg = arg;
        return expectedOutput;
      };
      /* oxlint-enable typescript/require-await */

      const handler = middleware(next, {});
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fc.record() output matches FinalizeHandlerArguments shape
      const result = await handler(args as FinalizeHandlerArguments<object>);

      expect(nextCalled).toBe(true);
      expect(receivedArg).toBe(args);
      expect(result).toBe(expectedOutput);
    },
  );
});
