/* oxlint-disable typescript/require-await -- handler stubs are async without await to satisfy Promise-returning handler interface */
import { describe, it, expect } from "vitest";

import {
  setDeadlineSignal,
  getDeadlineSignal,
  withLambdaDeadline,
} from "../../src/context-store.js";
import { DeadlineExceededError } from "../../src/error.js";

import type { LambdaContextLike } from "../../src/context-store.js";

describe("withLambdaDeadline", () => {
  it("returns a function with same handler signature", () => {
    const handler = async (_event: unknown, _context: LambdaContextLike) => ({ statusCode: 200 });
    const wrapped = withLambdaDeadline(handler);
    expect(typeof wrapped).toBe("function");
  });

  it("preserves the return value of the handler", async () => {
    const expected = { statusCode: 200, body: "hello" };
    const handler = async () => expected;
    const wrapped = withLambdaDeadline(handler);

    const context: LambdaContextLike = {
      getRemainingTimeInMillis: () => 5000,
    };
    const result = await wrapped({}, context);
    expect(result).toBe(expected);
  });

  it("propagates errors without wrapping", async () => {
    const error = new Error("handler failed");
    const handler = async () => {
      throw error;
    };
    const wrapped = withLambdaDeadline(handler);

    const context: LambdaContextLike = {
      getRemainingTimeInMillis: () => 5000,
    };
    await expect(wrapped({}, context)).rejects.toBe(error);
  });

  it("creates a deadline signal from context when no external signal is set", async () => {
    let captured: AbortSignal | undefined;
    const handler = async () => {
      captured = getDeadlineSignal();
      return "done";
    };
    const wrapped = withLambdaDeadline(handler);

    const context: LambdaContextLike = {
      getRemainingTimeInMillis: () => 5000,
    };
    await wrapped({}, context);
    expect(captured).toBeDefined();
    expect(captured).toBeInstanceOf(AbortSignal);
    expect(captured?.aborted).toBe(false);
  });

  it("handles null context without throwing", async () => {
    const handler = async (_event: unknown, _context: LambdaContextLike) => "ok";
    const wrapped = withLambdaDeadline(handler);

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- testing null context edge case
    const result = await wrapped({}, null as unknown as LambdaContextLike);
    expect(result).toBe("ok");
  });

  it("handles undefined context without throwing", async () => {
    const handler = async (_event: unknown, _context: LambdaContextLike) => "ok";
    const wrapped = withLambdaDeadline(handler);

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- testing undefined context edge case
    const result = await wrapped({}, undefined as unknown as LambdaContextLike);
    expect(result).toBe("ok");
  });

  it("does not set a deadline signal when context is null", async () => {
    let captured: AbortSignal | undefined = AbortSignal.timeout(999);
    const handler = async () => {
      captured = getDeadlineSignal();
      return "done";
    };
    const wrapped = withLambdaDeadline(handler);

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- testing null context edge case
    await wrapped({}, null as unknown as LambdaContextLike);
    expect(captured).toBeUndefined();
  });

  it("handles context without getRemainingTimeInMillis method", async () => {
    let captured: AbortSignal | undefined = AbortSignal.timeout(999);
    const handler = async () => {
      captured = getDeadlineSignal();
      return "done";
    };
    const wrapped = withLambdaDeadline(handler);

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- testing empty context edge case
    const context = {} as LambdaContextLike;
    await wrapped({}, context);
    expect(captured).toBeUndefined();
  });

  it("always returns a Promise", () => {
    const handler = async () => 42;
    const wrapped = withLambdaDeadline(handler);

    const context: LambdaContextLike = {
      getRemainingTimeInMillis: () => 5000,
    };
    const result = wrapped({}, context);
    expect(result).toBeInstanceOf(Promise);
  });

  it("throws DeadlineExceededError when remaining time <= flush buffer", async () => {
    const handler = async () => "should not reach";
    const wrapped = withLambdaDeadline(handler, { flushBufferMs: 1000 });

    const context: LambdaContextLike = {
      getRemainingTimeInMillis: () => 500,
    };

    const error = await wrapped({}, context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DeadlineExceededError);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- narrowing after instanceof check
    const dee = error as DeadlineExceededError;
    expect(dee.deadlineMs).toBe(0);
    expect(dee.flushBufferMs).toBe(1000);
    expect(dee.remainingMs).toBe(500);
  });

  it("throws DeadlineExceededError when remaining equals flush buffer", async () => {
    const handler = async () => "should not reach";
    const wrapped = withLambdaDeadline(handler, { flushBufferMs: 2000 });

    const context: LambdaContextLike = {
      getRemainingTimeInMillis: () => 2000,
    };

    const error = await wrapped({}, context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DeadlineExceededError);
  });

  it("uses default flushBufferMs of 1000 when no options provided", async () => {
    const handler = async () => "should not reach";
    const wrapped = withLambdaDeadline(handler);

    const context: LambdaContextLike = {
      getRemainingTimeInMillis: () => 800,
    };

    const error = await wrapped({}, context).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DeadlineExceededError);
  });

  it("succeeds when remaining time > flush buffer", async () => {
    const handler = async () => "ok";
    const wrapped = withLambdaDeadline(handler, { flushBufferMs: 1000 });

    const context: LambdaContextLike = {
      getRemainingTimeInMillis: () => 5000,
    };

    const result = await wrapped({}, context);
    expect(result).toBe("ok");
  });
});

describe("setDeadlineSignal", () => {
  it("throws when called outside a withLambdaDeadline() scope", () => {
    const signal = new AbortController().signal;
    expect(() => {
      setDeadlineSignal(signal);
    }).toThrow("setDeadlineSignal() must be called within a withLambdaDeadline() scope");
  });

  it("overwrites the auto-computed signal", async () => {
    const controller = new AbortController();
    const context: LambdaContextLike = { getRemainingTimeInMillis: () => 5000 };

    let captured: AbortSignal | undefined;
    const handler = async () => {
      setDeadlineSignal(controller.signal);
      captured = getDeadlineSignal();
      return "done";
    };
    const wrapped = withLambdaDeadline(handler);

    await wrapped({}, context);
    expect(captured).toBe(controller.signal);
  });

  it("allows overwriting a previously set signal", async () => {
    const first = new AbortController().signal;
    const second = new AbortController().signal;
    const context: LambdaContextLike = { getRemainingTimeInMillis: () => 5000 };

    let captured: AbortSignal | undefined;
    const handler = async () => {
      setDeadlineSignal(first);
      setDeadlineSignal(second);
      captured = getDeadlineSignal();
      return "done";
    };
    const wrapped = withLambdaDeadline(handler);

    await wrapped({}, context);
    expect(captured).toBe(second);
  });
});

describe("getDeadlineSignal", () => {
  it("returns undefined outside a withLambdaDeadline() scope", () => {
    expect(getDeadlineSignal()).toBeUndefined();
  });

  it("returns the auto-computed signal when no external signal is set", async () => {
    const context: LambdaContextLike = { getRemainingTimeInMillis: () => 5000 };

    let captured: AbortSignal | undefined;
    const handler = async () => {
      captured = getDeadlineSignal();
      return "done";
    };
    const wrapped = withLambdaDeadline(handler);

    await wrapped({}, context);
    expect(captured).toBeDefined();
    expect(captured).toBeInstanceOf(AbortSignal);
  });

  it("returns undefined when context has no getRemainingTimeInMillis", async () => {
    let captured: AbortSignal | undefined = AbortSignal.timeout(999);
    const handler = async () => {
      captured = getDeadlineSignal();
      return "done";
    };
    const wrapped = withLambdaDeadline(handler);

    await wrapped({}, {});
    expect(captured).toBeUndefined();
  });

  it("isolates signals between concurrent async contexts", async () => {
    const signalA = new AbortController().signal;
    const signalB = new AbortController().signal;
    const contextA: LambdaContextLike = { getRemainingTimeInMillis: () => 5000 };
    const contextB: LambdaContextLike = { getRemainingTimeInMillis: () => 8000 };

    const handlerA = async () => {
      setDeadlineSignal(signalA);
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      return getDeadlineSignal();
    };
    const handlerB = async () => {
      setDeadlineSignal(signalB);
      await new Promise((resolve) => {
        setTimeout(resolve, 10);
      });
      return getDeadlineSignal();
    };

    const [resultA, resultB] = await Promise.all([
      withLambdaDeadline(handlerA)({}, contextA),
      withLambdaDeadline(handlerB)({}, contextB),
    ]);

    expect(resultA).toBe(signalA);
    expect(resultB).toBe(signalB);
  });
});
