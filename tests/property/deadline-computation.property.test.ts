import { test, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { run } from "../../src/context-store.js";
import { computeDeadline } from "../../src/middleware.js";
import { flushBufferMs } from "../../src/types.js";
import type { DeadlineMiddlewareConfig } from "../../src/types.js";

/**
 * Insufficient time produces immediate abort
 * For any remaining time R and flush buffer B where R ≤ B, the middleware
 * immediately produces a DeadlineExceededError without dispatching an HTTP request.
 */
describe("Insufficient time produces immediate abort", () => {
  test.prop([fc.integer({ min: 0, max: 900_000 }), fc.integer({ min: 0, max: 900_000 })], {
    numRuns: 100,
  })("computeDeadline returns insufficient-time when remaining <= buffer", (remaining, buffer) => {
    fc.pre(remaining <= buffer);

    const config: DeadlineMiddlewareConfig = {
      flushBufferMs: flushBufferMs(buffer),
      telemetryEnabled: false,
    };

    const result = run({ getRemainingTimeInMillis: () => remaining }, () =>
      computeDeadline(config),
    );

    expect(result).toEqual({
      kind: "insufficient-time",
      remaining,
      buffer,
    });
  });

  test.prop([fc.integer({ min: 0, max: 900_000 })], { numRuns: 100 })(
    "computeDeadline returns insufficient-time when remaining === buffer (exactly zero deadline)",
    (value) => {
      const config: DeadlineMiddlewareConfig = {
        flushBufferMs: flushBufferMs(value),
        telemetryEnabled: false,
      };

      const result = run({ getRemainingTimeInMillis: () => value }, () => computeDeadline(config));

      expect(result).toEqual({
        kind: "insufficient-time",
        remaining: value,
        buffer: value,
      });
    },
  );

  test.prop([fc.integer({ min: 0, max: 900_000 }), fc.integer({ min: 0, max: 900_000 })], {
    numRuns: 100,
  })(
    "insufficient-time result contains correct remaining and buffer values",
    (remaining, buffer) => {
      fc.pre(remaining <= buffer);

      const config: DeadlineMiddlewareConfig = {
        flushBufferMs: flushBufferMs(buffer),
        telemetryEnabled: false,
      };

      const result = run({ getRemainingTimeInMillis: () => remaining }, () =>
        computeDeadline(config),
      );

      expect(result.kind).toBe("insufficient-time");
      if (result.kind === "insufficient-time") {
        expect(result.remaining).toBe(remaining);
        expect(result.buffer).toBe(buffer);
      }
    },
  );
});
