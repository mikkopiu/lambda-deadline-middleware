// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";

import { withLambdaDeadline } from "../../src/context-store.js";
import { DeadlineExceededError } from "../../src/error.js";

import type { LambdaContextLike } from "../../src/context-store.js";

const noop = async () => {};
const ok = async () => {
  await Promise.resolve();
  return "ok";
};

describe("Fault injection: pathological getRemainingTimeInMillis values", () => {
  it("throws DeadlineExceededError when remaining is 0", async () => {
    const context: LambdaContextLike = { getRemainingTimeInMillis: () => 0 };
    await expect(withLambdaDeadline(noop)({}, context)).rejects.toBeInstanceOf(
      DeadlineExceededError,
    );
  });

  it("throws DeadlineExceededError when remaining is negative", async () => {
    const context: LambdaContextLike = { getRemainingTimeInMillis: () => -500 };
    await expect(withLambdaDeadline(noop)({}, context)).rejects.toBeInstanceOf(
      DeadlineExceededError,
    );
  });

  it("throws DeadlineExceededError when remaining equals flush buffer", async () => {
    const context: LambdaContextLike = { getRemainingTimeInMillis: () => 1000 };
    await expect(withLambdaDeadline(noop)({}, context)).rejects.toBeInstanceOf(
      DeadlineExceededError,
    );
  });

  it("no-ops when remaining is NaN", async () => {
    const context: LambdaContextLike = { getRemainingTimeInMillis: () => NaN };
    const result = await withLambdaDeadline(ok)({}, context);
    expect(result).toBe("ok");
  });

  it("no-ops when remaining is Infinity", async () => {
    const context: LambdaContextLike = { getRemainingTimeInMillis: () => Infinity };
    const result = await withLambdaDeadline(ok)({}, context);
    expect(result).toBe("ok");
  });

  it("handles non-integer remaining time without throwing", async () => {
    const context: LambdaContextLike = { getRemainingTimeInMillis: () => 1500.7 };
    const result = await withLambdaDeadline(ok)({}, context);
    expect(result).toBe("ok");
  });

  it("no-ops when getRemainingTimeInMillis is not a function", async () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- intentional: testing runtime guard against non-function
    const context = { getRemainingTimeInMillis: 42 } as unknown as LambdaContextLike;
    const result = await withLambdaDeadline(ok)({}, context);
    expect(result).toBe("ok");
  });

  it("propagates errors thrown by getRemainingTimeInMillis", async () => {
    const context: LambdaContextLike = {
      getRemainingTimeInMillis: () => {
        throw new Error("runtime exploded");
      },
    };
    await expect(withLambdaDeadline(noop)({}, context)).rejects.toThrow("runtime exploded");
  });

  it("no-ops when context is null", async () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- intentional: testing runtime guard against null
    const result = await withLambdaDeadline(ok)({}, null as unknown as LambdaContextLike);
    expect(result).toBe("ok");
  });

  it("no-ops when context is undefined", async () => {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- intentional: testing runtime guard against undefined
    const result = await withLambdaDeadline(ok)({}, undefined as unknown as LambdaContextLike);
    expect(result).toBe("ok");
  });
});

describe("Fault injection: pathological flushBufferMs values", () => {
  it("throws TypeError for negative flushBufferMs", async () => {
    const context: LambdaContextLike = { getRemainingTimeInMillis: () => 5000 };
    await expect(
      withLambdaDeadline(noop, { flushBufferMs: -1 })({}, context),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("throws TypeError for -Infinity flushBufferMs", async () => {
    const context: LambdaContextLike = { getRemainingTimeInMillis: () => 5000 };
    await expect(
      withLambdaDeadline(noop, { flushBufferMs: -Infinity })({}, context),
    ).rejects.toBeInstanceOf(TypeError);
  });

  it("succeeds with flushBufferMs of 0", async () => {
    const context: LambdaContextLike = { getRemainingTimeInMillis: () => 5000 };
    const result = await withLambdaDeadline(ok, { flushBufferMs: 0 })({}, context);
    expect(result).toBe("ok");
  });

  it("no-ops with flushBufferMs of NaN", async () => {
    const context: LambdaContextLike = { getRemainingTimeInMillis: () => 5000 };
    const result = await withLambdaDeadline(ok, { flushBufferMs: NaN })({}, context);
    expect(result).toBe("ok");
  });

  it("no-ops with flushBufferMs of Infinity", async () => {
    const context: LambdaContextLike = { getRemainingTimeInMillis: () => 5000 };
    const result = await withLambdaDeadline(ok, { flushBufferMs: Infinity })({}, context);
    expect(result).toBe("ok");
  });
});
