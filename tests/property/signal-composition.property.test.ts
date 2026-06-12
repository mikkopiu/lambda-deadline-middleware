import { test, fc } from "@fast-check/vitest";
import { describe, expect, vi, beforeEach, afterEach } from "vitest";
import { createDeadlineTimer, deadlineMiddlewareHandler } from "../../src/middleware.js";
import { flushBufferMs } from "../../src/types.js";
import type { DeadlineMiddlewareConfig, RequestDeadlineMs } from "../../src/types.js";
import type {
  FinalizeHandlerArguments,
  FinalizeHandlerOutput,
  HandlerExecutionContext,
} from "@smithy/types";

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

  const config: DeadlineMiddlewareConfig = {
    flushBufferMs: flushBufferMs(1000),
    telemetryEnabled: false,
  };

  test.prop([fc.integer({ min: 1, max: 900_000 })], { numRuns: 100 })(
    "after dispose, the timer does not fire and controller is not aborted",
    (deadlineMs) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- branded type has no public constructor; only produced internally
      const timer = createDeadlineTimer(deadlineMs as RequestDeadlineMs, config);

      // Dispose the timer (simulates request completing before deadline)
      timer[Symbol.dispose]();

      // Advance time well past the deadline
      vi.advanceTimersByTime(deadlineMs + 1000);

      // The controller should NOT be aborted since we disposed
      expect(timer.controller.signal.aborted).toBe(false);
    },
  );

  test.prop([fc.integer({ min: 1, max: 900_000 })], { numRuns: 100 })(
    "create timer, immediately dispose, advance past deadline — controller not aborted",
    (deadlineMs) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- branded type has no public constructor; only produced internally
      const timer = createDeadlineTimer(deadlineMs as RequestDeadlineMs, config);

      // Immediately dispose (simulates fast request completion)
      timer[Symbol.dispose]();

      // Advance time far beyond the deadline
      vi.advanceTimersByTime(deadlineMs * 2);

      // Controller must remain unaborted
      expect(timer.controller.signal.aborted).toBe(false);
    },
  );

  test.prop([fc.integer({ min: 1, max: 900_000 })], { numRuns: 100 })(
    "dispose clears all pending timers associated with the deadline",
    (deadlineMs) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- branded type has no public constructor; only produced internally
      const timer = createDeadlineTimer(deadlineMs as RequestDeadlineMs, config);

      // Dispose should clear the timer
      timer[Symbol.dispose]();

      // Verify no pending timers remain by checking getTimerCount
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  test.prop([fc.integer({ min: 1, max: 900_000 })], { numRuns: 100 })(
    "multiple dispose calls are safe (idempotent cleanup)",
    (deadlineMs) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- branded type has no public constructor; only produced internally
      const timer = createDeadlineTimer(deadlineMs as RequestDeadlineMs, config);

      // Calling dispose multiple times should not throw
      timer[Symbol.dispose]();
      timer[Symbol.dispose]();
      timer[Symbol.dispose]();

      vi.advanceTimersByTime(deadlineMs + 1000);
      expect(timer.controller.signal.aborted).toBe(false);
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
  const config: DeadlineMiddlewareConfig = {
    flushBufferMs: flushBufferMs(1000),
    telemetryEnabled: false,
  };

  const handlerContext: HandlerExecutionContext = {};

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

      const handler = deadlineMiddlewareHandler(config)(next, handlerContext);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fc.record() output matches FinalizeHandlerArguments shape
      const result = await handler(args as FinalizeHandlerArguments<object>);

      // Args passed to next should be the same reference (unmodified)
      expect(receivedArgs).toHaveLength(1);
      expect(receivedArgs[0]).toBe(args);

      // Result should be what next returned (same reference)
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
      const customConfig: DeadlineMiddlewareConfig = {
        flushBufferMs: flushBufferMs(bufferValue),
        telemetryEnabled: false,
      };

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

      const handler = deadlineMiddlewareHandler(customConfig)(next, handlerContext);
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fc.record() output matches FinalizeHandlerArguments shape
      const result = await handler(args as FinalizeHandlerArguments<object>);

      expect(nextCalled).toBe(true);
      expect(receivedArg).toBe(args);
      expect(result).toBe(expectedOutput);
    },
  );
});
