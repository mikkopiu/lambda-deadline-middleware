import { test, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { DeadlineExceededError, isDeadlineExceeded } from "../../src/error.js";
import { flushBufferMs, milliseconds } from "../../src/types.js";

/**
 * Type guard correctness
 * For any value that is an instance of DeadlineExceededError, isDeadlineExceeded returns true.
 * For any value that is not (including null, undefined, non-Error objects, Errors with different names),
 * isDeadlineExceeded returns false.
 */
describe("Type guard correctness", () => {
  // Arbitrary for DeadlineExceededError instances with random branded values
  const deadlineExceededErrorArb = fc
    .record({
      deadlineMs: fc.integer({ min: 0, max: 900_000 }),
      flushBufferMs: fc.integer({ min: 0, max: 900_000 }),
      remainingMs: fc.integer({ min: 0, max: 900_000 }),
    })
    .map(
      ({ deadlineMs, flushBufferMs: flushBuffer, remainingMs }) =>
        new DeadlineExceededError({
          deadlineMs: milliseconds(deadlineMs),
          flushBufferMs: flushBufferMs(flushBuffer),
          remainingMs: milliseconds(remainingMs),
        }),
    );

  test.prop([deadlineExceededErrorArb], { numRuns: 100 })(
    "isDeadlineExceeded returns true for any DeadlineExceededError instance",
    (error) => {
      expect(isDeadlineExceeded(error)).toBe(true);
    },
  );

  // Arbitrary for non-DeadlineExceededError values
  const nonDeadlineExceededArb = fc.oneof(
    // null and undefined
    fc.constant(null),
    fc.constant(undefined),
    // primitives
    fc.string(),
    fc.integer(),
    fc.double(),
    fc.boolean(),
    // plain objects (no name or wrong name)
    fc.record({ message: fc.string() }),
    fc.record({ name: fc.string().filter((n) => n !== "DeadlineExceededError") }),
    // Error instances with different names
    fc.string().map((msg) => new Error(msg)),
    fc.string().map((msg) => new TypeError(msg)),
    fc.string().map((msg) => new RangeError(msg)),
    // Objects with name property but not DeadlineExceededError
    fc.record({
      name: fc.string().filter((n) => n !== "DeadlineExceededError"),
      message: fc.string(),
      stack: fc.string(),
    }),
  );

  test.prop([nonDeadlineExceededArb], { numRuns: 100 })(
    "isDeadlineExceeded returns false for any non-DeadlineExceededError value",
    (value) => {
      expect(isDeadlineExceeded(value)).toBe(false);
    },
  );
});
