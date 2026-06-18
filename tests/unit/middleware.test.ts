import type { FinalizeHandlerArguments, FinalizeHandlerOutput } from "@smithy/types";

/* oxlint-disable typescript/require-await -- next() stubs are async without await to satisfy FinalizeHandler signature */
import { describe, it, expect, vi } from "vitest";

import { setDeadlineSignal, withLambdaDeadline } from "../../src/context-store.js";
import { deadlineMiddleware } from "../../src/middleware.js";

/**
 * Helper to extract the middleware handler function from the Pluggable.
 */
function extractHandler() {
  const pluggable = deadlineMiddleware();
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

describe("deadlineMiddleware registration", () => {
  it("returns a Pluggable with applyToStack method", () => {
    const pluggable = deadlineMiddleware();
    expect(pluggable.applyToStack).toBeInstanceOf(Function);
  });

  it("registers middleware at finalizeRequest step with name 'deadlineMiddleware'", () => {
    const pluggable = deadlineMiddleware();
    const add = vi.fn();
    const stack = { add };

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- minimal mock
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

describe("deadline middleware handler", () => {
  it("passes args through unmodified when no deadline signal is set", async () => {
    const middleware = extractHandler();
    const args: FinalizeHandlerArguments<object> = {
      input: {},
      request: { method: "POST", hostname: "localhost", path: "/" },
    };
    const expectedOutput: FinalizeHandlerOutput<object> = {
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

  it("attaches the auto-computed deadline signal to requests", async () => {
    const middleware = extractHandler();
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

    const lambdaHandler = withLambdaDeadline(async () => {
      await handler(args);
    });

    await lambdaHandler({}, { getRemainingTimeInMillis: () => 5000 });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it("composes existing request signal with deadline signal", async () => {
    const middleware = extractHandler();
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

    const lambdaHandler = withLambdaDeadline(async () => {
      await handler(args);
    });

    await lambdaHandler({}, { getRemainingTimeInMillis: () => 5000 });

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal).not.toBe(existingController.signal);

    existingController.abort(new Error("existing abort"));
    expect(capturedSignal?.aborted).toBe(true);
  });

  it("uses external signal when set via setDeadlineSignal", async () => {
    const middleware = extractHandler();
    const controller = new AbortController();
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

    const middlewareHandler = middleware(next, {});

    const lambdaHandler = withLambdaDeadline(async () => {
      setDeadlineSignal(controller.signal);
      await middlewareHandler(args);
    });

    await lambdaHandler({}, { getRemainingTimeInMillis: () => 5000 });

    expect(capturedSignal).toBe(controller.signal);
  });

  it("external signal takes priority over auto-computed deadline", async () => {
    const middleware = extractHandler();
    const controller = new AbortController();
    const args: FinalizeHandlerArguments<object> = {
      input: {},
      request: { method: "POST", hostname: "localhost", path: "/" },
    };

    // Remaining time (500ms) < default flushBuffer (1000ms) would throw
    // But we set an external signal before the middleware runs, so
    // withLambdaDeadline computes the signal first and throws. We need enough time.
    const next = async () => ({
      response: { statusCode: 200 } as object,
      output: {} as object,
    });

    const middlewareHandler = middleware(next, {});

    const lambdaHandler = withLambdaDeadline(async () => {
      setDeadlineSignal(controller.signal);
      await middlewareHandler(args);
    });

    // flushBuffer default is 1000, remaining 5000 — so auto-signal is created,
    // but setDeadlineSignal overwrites it with our controller's signal.
    await expect(
      lambdaHandler({}, { getRemainingTimeInMillis: () => 5000 }),
    ).resolves.toBeUndefined();
  });

  it("handles request being undefined without throwing", async () => {
    const middleware = extractHandler();
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- testing undefined request edge case
    const args = {
      input: {},
      request: undefined,
    } as unknown as FinalizeHandlerArguments<object>;

    const next = async () => ({
      response: { statusCode: 200 } as object,
      output: {} as object,
    });

    const handler = middleware(next, {});

    const lambdaHandler = withLambdaDeadline(async () => {
      await handler(args);
    });

    await expect(
      lambdaHandler({}, { getRemainingTimeInMillis: () => 5000 }),
    ).resolves.toBeUndefined();
  });

  it("propagates already-aborted external signal", async () => {
    const middleware = extractHandler();
    const controller = new AbortController();
    controller.abort(new Error("pre-aborted"));

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

    const middlewareHandler = middleware(next, {});

    const lambdaHandler = withLambdaDeadline(async () => {
      setDeadlineSignal(controller.signal);
      await middlewareHandler(args);
    });

    await lambdaHandler({}, { getRemainingTimeInMillis: () => 5000 });

    expect(capturedSignal?.aborted).toBe(true);
  });
});
