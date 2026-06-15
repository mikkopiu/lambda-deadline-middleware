import { describe, it, expect } from "vitest";

import { run, getRemainingTimeInMillis } from "../../src/context-store.js";

describe("context-store", () => {
  describe("getRemainingTimeInMillis() outside run() scope", () => {
    it("returns undefined when called outside any run() scope", () => {
      expect(getRemainingTimeInMillis()).toBeUndefined();
    });
  });

  describe("run() with valid context", () => {
    it("returns the callback's return value", () => {
      const context = { getRemainingTimeInMillis: () => 5000 };
      const result = run(context, () => "hello");
      expect(result).toBe("hello");
    });

    it("makes getRemainingTimeInMillis() accessible within the callback", () => {
      const context = { getRemainingTimeInMillis: () => 3000 };
      let captured: number | undefined;
      run(context, () => {
        captured = getRemainingTimeInMillis();
      });
      expect(captured).toBe(3000);
    });

    it("delegates to the stored context's method on each call", () => {
      let remaining = 5000;
      const context = { getRemainingTimeInMillis: () => remaining };

      run(context, () => {
        expect(getRemainingTimeInMillis()).toBe(5000);
        remaining = 3000;
        expect(getRemainingTimeInMillis()).toBe(3000);
      });
    });
  });

  describe("run() with null context", () => {
    it("does not throw", () => {
      expect(() => run(null, () => "ok")).not.toThrow();
    });

    it("returns undefined from getRemainingTimeInMillis()", () => {
      let captured: number | undefined = 999;
      run(null, () => {
        captured = getRemainingTimeInMillis();
      });
      expect(captured).toBeUndefined();
    });
  });

  describe("run() with undefined context", () => {
    it("does not throw", () => {
      expect(() => run(undefined, () => "ok")).not.toThrow();
    });

    it("returns undefined from getRemainingTimeInMillis()", () => {
      let captured: number | undefined = 999;
      run(undefined, () => {
        captured = getRemainingTimeInMillis();
      });
      expect(captured).toBeUndefined();
    });
  });

  describe("run() with context missing getRemainingTimeInMillis", () => {
    it("does not throw", () => {
      const context = {};
      expect(() => run(context, () => "ok")).not.toThrow();
    });

    it("returns undefined from getRemainingTimeInMillis()", () => {
      const context = {};
      let captured: number | undefined = 999;
      run(context, () => {
        captured = getRemainingTimeInMillis();
      });
      expect(captured).toBeUndefined();
    });
  });

  describe("isolation", () => {
    it("nested run() scopes see their own context", () => {
      const outer = { getRemainingTimeInMillis: () => 9000 };
      const inner = { getRemainingTimeInMillis: () => 2000 };

      run(outer, () => {
        expect(getRemainingTimeInMillis()).toBe(9000);
        run(inner, () => {
          expect(getRemainingTimeInMillis()).toBe(2000);
        });
        expect(getRemainingTimeInMillis()).toBe(9000);
      });
    });

    it("concurrent async operations read their own context", async () => {
      const contextA = { getRemainingTimeInMillis: () => 1000 };
      const contextB = { getRemainingTimeInMillis: () => 8000 };

      const [resultA, resultB] = await Promise.all([
        new Promise<number | undefined>((resolve) => {
          run(contextA, () => {
            setTimeout(() => {
              resolve(getRemainingTimeInMillis());
            }, 10);
          });
        }),
        new Promise<number | undefined>((resolve) => {
          run(contextB, () => {
            setTimeout(() => {
              resolve(getRemainingTimeInMillis());
            }, 10);
          });
        }),
      ]);

      expect(resultA).toBe(1000);
      expect(resultB).toBe(8000);
    });
  });

  describe("store === undefined vs store === NO_CONTEXT guard", () => {
    it("returns undefined when store is NO_CONTEXT (null context passed to run)", () => {
      let result: number | undefined = 999;
      run(null, () => {
        result = getRemainingTimeInMillis();
      });
      expect(result).toBeUndefined();
    });

    it("returns undefined rather than throwing when context has no method", () => {
      let result: number | undefined = 999;
      run({}, () => {
        result = getRemainingTimeInMillis();
      });
      expect(result).toBeUndefined();
    });
  });

  describe("return value propagation", () => {
    it("returns synchronous values from callback", () => {
      const context = { getRemainingTimeInMillis: () => 5000 };
      const result = run(context, () => 42);
      expect(result).toBe(42);
    });

    it("returns promises from async callbacks", async () => {
      const context = { getRemainingTimeInMillis: () => 5000 };
      // oxlint-disable-next-line typescript/require-await -- testing that run() propagates Promise return values
      const result = await run(context, async () => "async-value");
      expect(result).toBe("async-value");
    });
  });
});
