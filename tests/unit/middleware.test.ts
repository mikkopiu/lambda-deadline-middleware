/* oxlint-disable typescript/require-await -- next() stubs are async without await to satisfy FinalizeHandler signature */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeDeadline,
  composeSignals,
  createDeadlineTimer,
  deadlineMiddlewareHandler,
} from "../../src/middleware.js";
import { run } from "../../src/context-store.js";
import { DeadlineExceededError } from "../../src/error.js";
import { flushBufferMs } from "../../src/types.js";
import type { DeadlineMiddlewareConfig, RequestDeadlineMs } from "../../src/types.js";
import type {
  FinalizeHandlerArguments,
  FinalizeHandlerOutput,
  HandlerExecutionContext,
} from "@smithy/types";

describe("computeDeadline", () => {
  const config: DeadlineMiddlewareConfig = {
    flushBufferMs: flushBufferMs(1000),
    telemetryEnabled: false,
  };

  it("returns no-context when outside a run() scope", () => {
    const result = computeDeadline(config);
    expect(result).toEqual({ kind: "no-context" });
  });

  it("returns deadline with correct value (remaining - flushBufferMs)", () => {
    const result = run({ getRemainingTimeInMillis: () => 5000 }, () => computeDeadline(config));
    expect(result).toEqual({ kind: "deadline", value: 4000 });
  });

  it("returns insufficient-time when remaining equals buffer", () => {
    const result = run({ getRemainingTimeInMillis: () => 1000 }, () => computeDeadline(config));
    expect(result.kind).toBe("insufficient-time");
  });

  it("returns insufficient-time when remaining is less than buffer", () => {
    const result = run({ getRemainingTimeInMillis: () => 500 }, () => computeDeadline(config));
    expect(result.kind).toBe("insufficient-time");
    if (result.kind === "insufficient-time") {
      expect(result.remaining).toBe(500);
      expect(result.buffer).toBe(1000);
    }
  });
});

describe("createDeadlineTimer", () => {
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

  it("creates a timer that aborts after deadlineMs with DeadlineExceededError", () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- branded type has no public constructor; only produced internally
    const timer = createDeadlineTimer(3500 as RequestDeadlineMs, config);

    expect(timer.controller.signal.aborted).toBe(false);
    vi.advanceTimersByTime(3500);
    expect(timer.controller.signal.aborted).toBe(true);
    expect(timer.controller.signal.reason).toBeInstanceOf(DeadlineExceededError);
  });

  it("abort error contains correct remainingMs = deadlineMs + flushBufferMs", () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- branded type has no public constructor; only produced internally
    const timer = createDeadlineTimer(3500 as RequestDeadlineMs, config);
    vi.advanceTimersByTime(3500);

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowing signal.reason after abort is triggered
    const error = timer.controller.signal.reason as DeadlineExceededError;
    // remainingMs should be deadlineMs + flushBufferMs = 3500 + 1000 = 4500
    expect(error.remainingMs).toBe(4500);
    expect(error.deadlineMs).toBe(3500);
    expect(error.flushBufferMs).toBe(1000);
  });

  it("abort error remainingMs is deadlineMs + flushBufferMs, not deadlineMs - flushBufferMs", () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- branded type has no public constructor; only produced internally
    const timer = createDeadlineTimer(2000 as RequestDeadlineMs, config);
    vi.advanceTimersByTime(2000);

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowing signal.reason after abort is triggered
    const error = timer.controller.signal.reason as DeadlineExceededError;
    // Correct is deadlineMs + config.flushBufferMs = 2000 + 1000 = 3000
    expect(error.remainingMs).toBe(3000);
  });

  it("[Symbol.dispose]() clears the timeout so it never fires", () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- branded type has no public constructor; only produced internally
    const timer = createDeadlineTimer(100 as RequestDeadlineMs, config);
    timer[Symbol.dispose]();
    vi.advanceTimersByTime(200);
    expect(timer.controller.signal.aborted).toBe(false);
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

    // The composed signal should NOT be the same as the deadline signal alone
    expect(result).not.toBe(deadlineController.signal);
    // It should abort when the existing signal aborts
    existingController.abort(new Error("existing abort"));
    expect(result.aborted).toBe(true);
  });

  it("composed signal aborts when existing signal fires", () => {
    const existingController = new AbortController();
    const deadlineController = new AbortController();
    const result = composeSignals(existingController.signal, deadlineController.signal);

    existingController.abort(new Error("test"));
    expect(result.aborted).toBe(true);
  });

  it("composed signal aborts when deadline signal fires", () => {
    const existingController = new AbortController();
    const deadlineController = new AbortController();
    const result = composeSignals(existingController.signal, deadlineController.signal);

    deadlineController.abort(new Error("deadline"));
    expect(result.aborted).toBe(true);
  });

  it("returns AbortSignal.any() with both signals (not empty array)", () => {
    const existingController = new AbortController();
    const deadlineController = new AbortController();
    const result = composeSignals(existingController.signal, deadlineController.signal);

    // The composed signal should respond to both signals
    expect(result.aborted).toBe(false);
    deadlineController.abort(new Error("deadline"));
    expect(result.aborted).toBe(true);
  });
});

describe("deadlineMiddlewareHandler", () => {
  const config: DeadlineMiddlewareConfig = {
    flushBufferMs: flushBufferMs(1000),
    telemetryEnabled: false,
  };
  const handlerContext: HandlerExecutionContext = {};

  it("passes args through unmodified in no-context mode", async () => {
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

    const handler = deadlineMiddlewareHandler(config)(next, handlerContext);
    const result = await handler(args);

    expect(receivedArgs).toBe(args);
    expect(result).toBe(expectedOutput);
  });

  it("throws DeadlineExceededError in insufficient-time mode with correct properties", async () => {
    const args: FinalizeHandlerArguments<object> = {
      input: {},
      request: { method: "POST", hostname: "localhost", path: "/" },
    };

    const next = async () => ({
      response: {} as object,
      output: {} as object,
    });

    const handler = deadlineMiddlewareHandler(config)(next, handlerContext);

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

  it("uses optional chaining safely when request has no signal", async () => {
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

    const handler = deadlineMiddlewareHandler(config)(next, handlerContext);

    await run({ getRemainingTimeInMillis: () => 5000 }, async () => handler(args));

    // Signal should be set (the deadline controller's signal)
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it("handles request being undefined without throwing", async () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- testing undefined request edge case
    const args = {
      input: {},
      request: undefined,
    } as unknown as FinalizeHandlerArguments<object>;

    const next = async (_a: FinalizeHandlerArguments<object>) => ({
      response: { statusCode: 200 } as object,
      output: {} as object,
    });

    const handler = deadlineMiddlewareHandler(config)(next, handlerContext);

    // Should not throw when request is undefined/null
    await expect(
      run({ getRemainingTimeInMillis: () => 5000 }, async () => handler(args)),
    ).resolves.toBeDefined();
  });

  it("composes existing signal with deadline signal when request has a signal", async () => {
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

    const handler = deadlineMiddlewareHandler(config)(next, handlerContext);

    await run({ getRemainingTimeInMillis: () => 5000 }, async () => handler(args));

    // Signal should be a composed signal (not the original or just the deadline)
    expect(capturedSignal).toBeDefined();
    expect(capturedSignal).not.toBe(existingController.signal);

    // Composed signal should abort when existing signal fires
    existingController.abort(new Error("existing abort"));
    expect(capturedSignal?.aborted).toBe(true);
  });
});
