import { test, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";
import { setImmediate as nextTick } from "node:timers/promises";
import { run, getRemainingTimeInMillis } from "../../src/context-store.js";

/**
 * Context store isolation
 * For any two concurrent Lambda invocations with different getRemainingTimeInMillis() values,
 * reading the remaining time from within each invocation's async chain always returns
 * that invocation's own value, never the other's.
 */
describe("Context store isolation", () => {
  test.prop([fc.integer({ min: 1, max: 900_000 }), fc.integer({ min: 1, max: 900_000 })], {
    numRuns: 100,
  })(
    "concurrent invocations with different remaining times read their own value",
    async (timeA, timeB) => {
      fc.pre(timeA !== timeB);

      const contextA = { getRemainingTimeInMillis: () => timeA };
      const contextB = { getRemainingTimeInMillis: () => timeB };

      const [resultA, resultB] = await Promise.all([
        run(contextA, async () => {
          // Yield to event loop to allow interleaving
          await nextTick();
          return getRemainingTimeInMillis();
        }),
        run(contextB, async () => {
          // Yield to event loop to allow interleaving
          await nextTick();
          return getRemainingTimeInMillis();
        }),
      ]);

      expect(resultA).toBe(timeA);
      expect(resultB).toBe(timeB);
    },
  );

  test.prop([fc.integer({ min: 1, max: 900_000 }), fc.integer({ min: 1, max: 900_000 })], {
    numRuns: 100,
  })(
    "concurrent invocations with multiple async awaits maintain isolation",
    async (timeA, timeB) => {
      fc.pre(timeA !== timeB);

      const contextA = { getRemainingTimeInMillis: () => timeA };
      const contextB = { getRemainingTimeInMillis: () => timeB };

      const [resultsA, resultsB] = await Promise.all([
        run(contextA, async () => {
          const readings: (number | undefined)[] = [];
          readings.push(getRemainingTimeInMillis());
          await nextTick();
          readings.push(getRemainingTimeInMillis());
          await nextTick();
          readings.push(getRemainingTimeInMillis());
          return readings;
        }),
        run(contextB, async () => {
          const readings: (number | undefined)[] = [];
          readings.push(getRemainingTimeInMillis());
          await nextTick();
          readings.push(getRemainingTimeInMillis());
          await nextTick();
          readings.push(getRemainingTimeInMillis());
          return readings;
        }),
      ]);

      // Every reading in context A should be timeA
      for (const reading of resultsA) {
        expect(reading).toBe(timeA);
      }

      // Every reading in context B should be timeB
      for (const reading of resultsB) {
        expect(reading).toBe(timeB);
      }
    },
  );
});
