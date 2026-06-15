import { test, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { withLambdaDeadline } from "../../src/handler-wrapper.js";

/**
 * Handler wrapper preserves errors
 * For any handler function that throws an error, wrapping it with `withLambdaDeadline`
 * and invoking it rejects with the identical error object (same reference).
 */
describe("Handler wrapper preserves errors", () => {
  test.prop([fc.string({ minLength: 1, maxLength: 200 })], { numRuns: 100 })(
    "wrapped handler rejects with the same error reference as the original throw",
    async (errorMessage) => {
      const originalError = new Error(errorMessage);

      // oxlint-disable-next-line typescript/require-await -- handler stub intentionally throws synchronously
      const handler = async () => {
        throw originalError;
      };

      const wrapped = withLambdaDeadline(handler);
      const context = { getRemainingTimeInMillis: () => 30_000 };

      await expect(wrapped({}, context)).rejects.toBe(originalError);
    },
  );

  test.prop(
    [
      fc.oneof(
        fc.string({ minLength: 1, maxLength: 100 }).map((msg) => new Error(msg)),
        fc.string({ minLength: 1, maxLength: 100 }).map((msg) => new TypeError(msg)),
        fc.string({ minLength: 1, maxLength: 100 }).map((msg) => new RangeError(msg)),
      ),
    ],
    { numRuns: 100 },
  )("wrapped handler preserves error subclass identity", async (originalError) => {
    // oxlint-disable-next-line typescript/require-await -- handler stub intentionally throws synchronously
    const handler = async () => {
      throw originalError;
    };

    const wrapped = withLambdaDeadline(handler);
    const context = { getRemainingTimeInMillis: () => 60_000 };

    await expect(wrapped({}, context)).rejects.toBe(originalError);
  });
});
