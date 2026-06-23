import { describe, expect, it } from "vitest";

import { DeadlineExceededError, isDeadlineExceeded } from "../../src/error.js";

describe("DeadlineExceededError", () => {
  it("has name set to 'DeadlineExceededError'", () => {
    const error = new DeadlineExceededError({
      deadlineMs: 3500,
      flushBufferMs: 1000,
      remainingMs: 4500,
    });
    expect(error.name).toBe("DeadlineExceededError");
  });

  it("extends Error", () => {
    const error = new DeadlineExceededError({
      deadlineMs: 3500,
      flushBufferMs: 1000,
      remainingMs: 4500,
    });
    expect(error).toBeInstanceOf(Error);
  });

  it("formats message with deadline and flush buffer values", () => {
    const error = new DeadlineExceededError({
      deadlineMs: 3500,
      flushBufferMs: 1000,
      remainingMs: 4500,
    });
    expect(error.message).toBe("Request deadline exceeded: 3500ms deadline (1000ms flush buffer)");
  });

  it("stores properties correctly", () => {
    const error = new DeadlineExceededError({
      deadlineMs: 2000,
      flushBufferMs: 500,
      remainingMs: 2500,
    });
    expect(error.deadlineMs).toBe(2000);
    expect(error.flushBufferMs).toBe(500);
    expect(error.remainingMs).toBe(2500);
  });

  it("has a stack trace", () => {
    const error = new DeadlineExceededError({
      deadlineMs: 100,
      flushBufferMs: 50,
      remainingMs: 150,
    });
    expect(error.stack).toBeDefined();
  });
});

describe("isDeadlineExceeded", () => {
  it("returns true for DeadlineExceededError instances", () => {
    const error = new DeadlineExceededError({
      deadlineMs: 3500,
      flushBufferMs: 1000,
      remainingMs: 4500,
    });
    expect(isDeadlineExceeded(error)).toBe(true);
  });

  it("returns false for a function with matching name", () => {
    const fn = function DeadlineExceededError() {}; // oxlint-disable-line no-shadow, func-name-matching -- Intentional shadow
    expect(isDeadlineExceeded(fn)).toBe(false);
  });

  it("returns false for null", () => {
    expect(isDeadlineExceeded(null)).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isDeadlineExceeded(undefined)).toBe(false);
  });

  it("returns false for non-object primitives", () => {
    expect(isDeadlineExceeded("error")).toBe(false);
    expect(isDeadlineExceeded(42)).toBe(false);
    expect(isDeadlineExceeded(true)).toBe(false);
  });

  it("returns false for plain Error", () => {
    expect(isDeadlineExceeded(new Error("some error"))).toBe(false);
  });

  it("returns false for Error with different name", () => {
    const error = new Error("timeout");
    error.name = "TimeoutError";
    expect(isDeadlineExceeded(error)).toBe(false);
  });

  it("returns true for duck-typed object with matching name", () => {
    const duckTyped = { name: "DeadlineExceededError", message: "test" };
    expect(isDeadlineExceeded(duckTyped)).toBe(true);
  });

  it("returns false for object without name property", () => {
    expect(isDeadlineExceeded({})).toBe(false);
    expect(isDeadlineExceeded({ message: "something" })).toBe(false);
  });
});
