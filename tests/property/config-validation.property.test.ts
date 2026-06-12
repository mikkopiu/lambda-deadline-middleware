import { test, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { parseConfig } from "../../src/config.js";

/**
 * Configuration validation rejects negative buffer
 * For any negative number passed as flushBufferMs, the library throws a TypeError at registration time.
 */
describe("Configuration validation rejects negative buffer", () => {
  test.prop([fc.double({ max: -Number.MIN_VALUE, noNaN: true })], {
    numRuns: 100,
  })("parseConfig throws TypeError for any negative flushBufferMs", (negativeBuffer) => {
    expect(() => parseConfig({ flushBufferMs: negativeBuffer })).toThrow(TypeError);
  });

  test.prop([fc.integer({ min: -1_000_000, max: -1 })], { numRuns: 100 })(
    "parseConfig throws TypeError for any negative integer flushBufferMs",
    (negativeBuffer) => {
      expect(() => parseConfig({ flushBufferMs: negativeBuffer })).toThrow(TypeError);
    },
  );

  test.prop([fc.double({ min: 0, noNaN: true, noDefaultInfinity: true })], { numRuns: 100 })(
    "parseConfig does NOT throw for non-negative flushBufferMs",
    (nonNegativeBuffer) => {
      expect(() => parseConfig({ flushBufferMs: nonNegativeBuffer })).not.toThrow();
    },
  );

  test.prop([fc.integer({ min: 0, max: 900_000 })], { numRuns: 100 })(
    "parseConfig does NOT throw for non-negative integer flushBufferMs",
    (nonNegativeBuffer) => {
      expect(() => parseConfig({ flushBufferMs: nonNegativeBuffer })).not.toThrow();
    },
  );
});
