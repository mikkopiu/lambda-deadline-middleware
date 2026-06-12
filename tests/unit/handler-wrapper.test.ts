/* oxlint-disable typescript/require-await -- handler stubs are async without await to satisfy Promise-returning handler interface */
import { describe, expect, it } from "vitest";
import { withLambdaDeadline } from "../../src/handler-wrapper.js";
import { getRemainingTimeInMillis } from "../../src/context-store.js";
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

  it("makes getRemainingTimeInMillis accessible within handler", async () => {
    let capturedTime: number | undefined;
    const handler = async () => {
      capturedTime = getRemainingTimeInMillis();
      return "done";
    };
    const wrapped = withLambdaDeadline(handler);

    const context: LambdaContextLike = {
      getRemainingTimeInMillis: () => 3000,
    };
    await wrapped({}, context);
    expect(capturedTime).toBe(3000);
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

  it("returns undefined from getRemainingTimeInMillis when context is null", async () => {
    let capturedTime: number | undefined = 999;
    const handler = async () => {
      capturedTime = getRemainingTimeInMillis();
      return "done";
    };
    const wrapped = withLambdaDeadline(handler);

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- testing null context edge case
    await wrapped({}, null as unknown as LambdaContextLike);
    expect(capturedTime).toBeUndefined();
  });

  it("handles context without getRemainingTimeInMillis method", async () => {
    let capturedTime: number | undefined = 999;
    const handler = async () => {
      capturedTime = getRemainingTimeInMillis();
      return "done";
    };
    const wrapped = withLambdaDeadline(handler);

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- testing empty context edge case
    const context = {} as LambdaContextLike;
    await wrapped({}, context);
    expect(capturedTime).toBeUndefined();
  });

  it("accepts optional DeadlineOptions without error", async () => {
    const handler = async () => "result";
    const wrapped = withLambdaDeadline(handler, { flushBufferMs: 2000 });

    const context: LambdaContextLike = {
      getRemainingTimeInMillis: () => 5000,
    };
    const result = await wrapped({}, context);
    expect(result).toBe("result");
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
});
