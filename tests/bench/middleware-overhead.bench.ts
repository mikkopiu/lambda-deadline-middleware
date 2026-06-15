import type {
  FinalizeHandler,
  FinalizeHandlerArguments,
  FinalizeHandlerOutput,
} from "@smithy/types";

/**
 * Performance benchmark for deadline middleware overhead.
 *
 * Measures the per-request overhead of the middleware execution path —
 * from middleware entry to calling next() — excluding downstream handler time.
 *
 * CI gate thresholds (validated via scripts/validate-bench.ts):
 * - p50 (median) < 50µs (0.05ms)
 * - p99 < 100µs (0.1ms)
 */
import { bench, describe } from "vitest";

import { run } from "../../src/context-store.js";
import { deadlineMiddleware } from "../../src/middleware.js";

// Extract the middleware handler function from the Pluggable
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
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- we know the shape
  return registeredFn as (
    next: FinalizeHandler<object, object>,
    context: object,
  ) => FinalizeHandler<object, object>;
}

// Realistic config: 1000ms flush buffer
const middleware = extractHandler({ flushBufferMs: 1000 });

// Minimal next() mock — returns immediately to isolate middleware overhead
/* oxlint-disable typescript/require-await -- stub satisfies FinalizeHandler interface */
const immediateNext: FinalizeHandler<object, object> = async (
  _args: FinalizeHandlerArguments<object>,
): Promise<FinalizeHandlerOutput<object>> => ({
  response: {},
  output: {} as object,
});
/* oxlint-enable typescript/require-await */

const handlerContext = {};

// Minimal request args
const baseArgs: FinalizeHandlerArguments<object> = {
  input: {},
  request: { signal: undefined } as FinalizeHandlerArguments<object>["request"],
};

// Args with an existing signal (for signal composition benchmark)
const argsWithSignal: FinalizeHandlerArguments<object> = {
  input: {},
  request: {
    signal: AbortSignal.timeout(30_000),
  } as FinalizeHandlerArguments<object>["request"],
};

describe("Deadline Middleware Overhead", () => {
  bench(
    "middleware overhead - with Lambda context (hot path)",
    async () => {
      // Simulate a Lambda with 5000ms remaining time
      await run({ getRemainingTimeInMillis: () => 5000 }, async () => {
        const dispatch = middleware(immediateNext, handlerContext);
        await dispatch(baseArgs);
      });
    },
    { iterations: 10_000, warmupIterations: 1_000 },
  );

  bench(
    "middleware overhead - no context (no-op path)",
    async () => {
      // Outside Lambda context — middleware should pass through immediately
      const dispatch = middleware(immediateNext, handlerContext);
      await dispatch(baseArgs);
    },
    { iterations: 10_000, warmupIterations: 1_000 },
  );

  bench(
    "middleware overhead - signal composition (with existing signal)",
    async () => {
      // Lambda context present + caller has already set an AbortSignal
      await run({ getRemainingTimeInMillis: () => 5000 }, async () => {
        const dispatch = middleware(immediateNext, handlerContext);
        await dispatch(argsWithSignal);
      });
    },
    { iterations: 10_000, warmupIterations: 1_000 },
  );
});
