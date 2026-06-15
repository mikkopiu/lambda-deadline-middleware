import type { FinalizeHandlerArguments, FinalizeHandlerOutput } from "@smithy/types";

/* oxlint-disable typescript/require-await -- next() stubs are async without await to satisfy FinalizeHandler signature */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { run } from "../../src/context-store.js";
import { DeadlineExceededError } from "../../src/error.js";
import { composeSignals, deadlineMiddleware } from "../../src/middleware.js";

describe("deadlineMiddleware config validation", () => {
  it("throws TypeError for negative flushBufferMs", () => {
    expect(() => deadlineMiddleware({ flushBufferMs: -1 })).toThrow(TypeError);
  });

  it("throws TypeError with descriptive message including the value", () => {
    expect(() => deadlineMiddleware({ flushBufferMs: -5 })).toThrow(
      "flushBufferMs option must be non-negative",
    );
    expect(() => deadlineMiddleware({ flushBufferMs: -5 })).toThrow("-5");
  });

  it("accepts zero for flushBufferMs", () => {
    expect(() => deadlineMiddleware({ flushBufferMs: 0 })).not.toThrow();
  });

  it("returns a Pluggable with applyToStack method", () => {
    const pluggable = deadlineMiddleware();
    expect(pluggable.applyToStack).toBeInstanceOf(Function);
  });

  it("registers middleware at finalizeRequest step with name 'deadlineMiddleware'", () => {
    const pluggable = deadlineMiddleware();
    const add = vi.fn();
    const stack = { add };

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- minimal mock satisfying complex Pluggable interface
    pluggable.applyToStack(stack as never);

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        step: "finalizeRequest",
        name: "deadlineMiddleware",
        override: true,
      }),
    );
  });
});

/**
 * Helper to extract the middleware handler function from the Pluggable.
 * Applies the pluggable to a mock stack and returns the registered handler.
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
  // The registered fn is a FinalizeRequestMiddleware: (next, context) => handler
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- we know the shape from the implementation
  const middleware = registeredFn as (
    next: (args: FinalizeHandlerArguments<object>) => Promise<FinalizeHandlerOutput<object>>,
    context: object,
  ) => (args: FinalizeHandlerArguments<object>) => Promise<FinalizeHandlerOutput<object>>;
  return middleware;
}

describe("deadline middleware handler", () => {
  it("passes args through unmodified in no-context mode", async () => {
    const middleware = extractHandler();
    const args: FinalizeHandlerArguments<object> = {
      input: {},
      request: { method: "POST", hostname: "localhost", path: "/" },
    };
    const expectedOutput: FinalizeHandlerOutput<object> = {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Smithy output requires opaque object type
      response: { statusCode: 200 } as object,
      output: {} as object,
    };

    let receivedArgs: unknown;
    const next = async (a: FinalizeHandlerArguments<object>) => {
      receivedArgs = a;
      return expectedOutput;
    };

    const handler = middleware(next, {});
    const result = await handler(args);

    expect(receivedArgs).toBe(args);
    expect(result).toBe(expectedOutput);
  });

  it("throws DeadlineExceededError when remaining time <= flush buffer", async () => {
    const middleware = extractHandler({ flushBufferMs: 1000 });
    const args: FinalizeHandlerArguments<object> = {
      input: {},
      request: { method: "POST", hostname: "localhost", path: "/" },
    };

    const next = async () => ({
      response: {} as object,
      output: {} as object,
    });

    const handler = middleware(next, {});

    const error = await run({ getRemainingTimeInMillis: () => 500 }, async () =>
      handler(args),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DeadlineExceededError);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowing after instanceof check above
    const dee = error as DeadlineExceededError;
    expect(dee.deadlineMs).toBe(0);
    expect(dee.flushBufferMs).toBe(1000);
    expect(dee.remainingMs).toBe(500);
  });

  it("attaches AbortSignal when request has no existing signal", async () => {
    const middleware = extractHandler({ flushBufferMs: 1000 });
    const args: FinalizeHandlerArguments<object> = {
      input: {},
      request: { method: "POST", hostname: "localhost", path: "/" },
    };

    let capturedSignal: AbortSignal | undefined;
    const next = async (a: FinalizeHandlerArguments<object>) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- accessing signal from opaque Smithy request
      capturedSignal = (a.request as { signal?: AbortSignal }).signal;
      return { response: { statusCode: 200 } as object, output: {} as object };
    };

    const handler = middleware(next, {});

    await run({ getRemainingTimeInMillis: () => 5000 }, async () => handler(args));

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it("composes existing signal with deadline signal", async () => {
    const middleware = extractHandler({ flushBufferMs: 1000 });
    const existingController = new AbortController();
    const args: FinalizeHandlerArguments<object> = {
      input: {},
      request: {
        method: "POST",
        hostname: "localhost",
        path: "/",
        signal: existingController.signal,
      },
    };

    let capturedSignal: AbortSignal | undefined;
    const next = async (a: FinalizeHandlerArguments<object>) => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- accessing signal from opaque Smithy request
      capturedSignal = (a.request as { signal?: AbortSignal }).signal;
      return { response: { statusCode: 200 } as object, output: {} as object };
    };

    const handler = middleware(next, {});

    await run({ getRemainingTimeInMillis: () => 5000 }, async () => handler(args));

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal).not.toBe(existingController.signal);

    existingController.abort(new Error("existing abort"));
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("handles request being undefined without throwing", async () => {
    const middleware = extractHandler({ flushBufferMs: 1000 });
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- testing undefined request edge case
    const args = {
      input: {},
      request: undefined,
    } as unknown as FinalizeHandlerArguments<object>;

    const next = async (_a: FinalizeHandlerArguments<object>) => ({
      response: { statusCode: 200 } as object,
      output: {} as object,
    });

    const handler = middleware(next, {});

    await expect(
      run({ getRemainingTimeInMillis: () => 5000 }, async () => handler(args)),
    ).resolves.toBeDefined();
  });
});

describe("deadline timer cleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears timeout after successful request (no lingering timers)", async () => {
    const middleware = extractHandler({ flushBufferMs: 0 });
    const args: FinalizeHandlerArguments<object> = {
      input: {},
      request: { method: "POST", hostname: "localhost", path: "/" },
    };

    const next = async () => ({
      response: { statusCode: 200 } as object,
      output: {} as object,
    });

    const handler = middleware(next, {});

    await run({ getRemainingTimeInMillis: () => 5000 }, async () => handler(args));

    // Timer should have been cleared
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears timeout after next() throws (cleanup in error path)", async () => {
    const middleware = extractHandler({ flushBufferMs: 0 });
    const args: FinalizeHandlerArguments<object> = {
      input: {},
      request: { method: "POST", hostname: "localhost", path: "/" },
    };

    const next = async () => {
      throw new Error("downstream error");
    };

    const handler = middleware(next, {});

    await run({ getRemainingTimeInMillis: () => 5000 }, async () => handler(args)).catch(() => {});

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("composeSignals", () => {
  it("returns deadline signal when existing is undefined", () => {
    const deadline = new AbortController().signal;
    const result = composeSignals(undefined, deadline);
    expect(result).toBe(deadline);
  });

  it("returns a composed signal (not the deadline alone) when existing is provided", () => {
    const existingController = new AbortController();
    const deadlineController = new AbortController();
    const result = composeSignals(existingController.signal, deadlineController.signal);

    expect(result).not.toBe(deadlineController.signal);
    existingController.abort(new Error("existing abort"));
    expect(result.aborted).toBe(true);
  });

  it("composed signal aborts when deadline signal fires", () => {
    const existingController = new AbortController();
    const deadlineController = new AbortController();
    const result = composeSignals(existingController.signal, deadlineController.signal);

    deadlineController.abort(new Error("deadline"));
    expect(result.aborted).toBe(true);
  });
});
