import { setImmediate as nextTick } from "node:timers/promises";

import { test, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import {
  getDeadlineSignal,
  setDeadlineSignal,
  withLambdaDeadline,
} from "../../src/context-store.js";

import type { LambdaContextLike } from "../../src/context-store.js";

/**
 * Context store isolation
 * For any two concurrent Lambda invocations with different external signals,
 * reading the deadline signal from within each invocation's async chain always returns
 * that invocation's own signal, never the other's.
 */
describe("Context store isolation", () => {
  test.prop([fc.integer({ min: 1001, max: 900_000 }), fc.integer({ min: 1001, max: 900_000 })], {
    numRuns: 100,
  })(
    "concurrent invocations with different signals read their own signal",
    async (timeA, timeB) => {
      fc.pre(timeA !== timeB);

      const signalA = new AbortController().signal;
      const signalB = new AbortController().signal;
      const contextA: LambdaContextLike = { getRemainingTimeInMillis: () => timeA };
      const contextB: LambdaContextLike = { getRemainingTimeInMillis: () => timeB };

      const [resultA, resultB] = await Promise.all([
        withLambdaDeadline(async () => {
          setDeadlineSignal(signalA);
          await nextTick();
          return getDeadlineSignal();
        })({}, contextA),
        withLambdaDeadline(async () => {
          setDeadlineSignal(signalB);
          await nextTick();
          return getDeadlineSignal();
        })({}, contextB),
      ]);

      expect(resultA).toBe(signalA);
      expect(resultB).toBe(signalB);
    },
  );

  test.prop([fc.integer({ min: 1001, max: 900_000 }), fc.integer({ min: 1001, max: 900_000 })], {
    numRuns: 100,
  })(
    "concurrent invocations with multiple async awaits maintain isolation",
    async (timeA, timeB) => {
      fc.pre(timeA !== timeB);

      const signalA = new AbortController().signal;
      const signalB = new AbortController().signal;
      const contextA: LambdaContextLike = { getRemainingTimeInMillis: () => timeA };
      const contextB: LambdaContextLike = { getRemainingTimeInMillis: () => timeB };

      const [resultsA, resultsB] = await Promise.all([
        withLambdaDeadline(async () => {
          setDeadlineSignal(signalA);
          const readings: (AbortSignal | undefined)[] = [];
          readings.push(getDeadlineSignal());
          await nextTick();
          readings.push(getDeadlineSignal());
          await nextTick();
          readings.push(getDeadlineSignal());
          return readings;
        })({}, contextA),
        withLambdaDeadline(async () => {
          setDeadlineSignal(signalB);
          const readings: (AbortSignal | undefined)[] = [];
          readings.push(getDeadlineSignal());
          await nextTick();
          readings.push(getDeadlineSignal());
          await nextTick();
          readings.push(getDeadlineSignal());
          return readings;
        })({}, contextB),
      ]);

      for (const reading of resultsA) {
        expect(reading).toBe(signalA);
      }

      for (const reading of resultsB) {
        expect(reading).toBe(signalB);
      }
    },
  );
});
