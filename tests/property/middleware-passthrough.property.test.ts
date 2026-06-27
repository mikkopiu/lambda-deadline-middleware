import type { FinalizeHandlerArguments, FinalizeHandlerOutput } from "@smithy/types";

import { test, fc } from "@fast-check/vitest";
import { describe, expect } from "vitest";

import { withLambdaDeadline } from "../../src/context-store.js";
import { deadlineMiddleware } from "../../src/middleware.js";

import type { LambdaContextLike } from "../../src/context-store.js";

/**
 * Helper to extract the middleware handler function from the Pluggable.
 */
function extractHandler() {
  const pluggable = deadlineMiddleware();
  let registeredFn: unknown;
  const stack = {
    add(fn: unknown) {
      registeredFn = fn;
    },
  };
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- minimal mock
  pluggable.applyToStack(stack as never);
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- we know the shape from the implementation
  return registeredFn as (
    next: (args: FinalizeHandlerArguments<object>) => Promise<FinalizeHandlerOutput<object>>,
    context: object,
  ) => (args: FinalizeHandlerArguments<object>) => Promise<FinalizeHandlerOutput<object>>;
}

/**
 * No-op outside Lambda context
 * For any SDK request dispatched when no deadline signal is stored,
 * the middleware passes the request through unmodified.
 */
const arbHostname = fc.string({ minLength: 1, maxLength: 50 });
const arbPath = fc.string({ minLength: 1, maxLength: 100 });
const arbInput = fc.record({ hostname: arbHostname, path: arbPath });
const arbRequest = fc.record({
  method: fc.constantFrom("GET", "POST", "PUT", "DELETE"),
  hostname: arbHostname,
  path: arbPath,
});

describe("No-op outside Lambda context", () => {
  test.prop([fc.record({ input: arbInput, request: arbRequest }), fc.anything()], { numRuns: 100 })(
    "middleware passes args through unmodified and returns next's result when no signal is stored",
    async (args, nextResult) => {
      const middleware = extractHandler();
      const receivedArgs: unknown[] = [];
      const expectedOutput: FinalizeHandlerOutput<object> = {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fc.anything() produces unknown
        response: nextResult as object,
        output: {} as object,
      };

      /* oxlint-disable typescript/require-await -- async stub */
      const next = async (
        receivedArg: FinalizeHandlerArguments<object>,
      ): Promise<FinalizeHandlerOutput<object>> => {
        receivedArgs.push(receivedArg);
        return expectedOutput;
      };
      /* oxlint-enable typescript/require-await */

      const handler = middleware(next, {});
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- fc.record() output matches FinalizeHandlerArguments shape
      const result = await handler(args as FinalizeHandlerArguments<object>);

      expect(receivedArgs).toHaveLength(1);
      expect(receivedArgs[0]).toBe(args);
      expect(result).toBe(expectedOutput);
    },
  );
});

/**
 * Signal is attached when within Lambda context
 * For any remaining time > flushBuffer, the middleware attaches a signal to the request.
 */
describe("Signal attached within Lambda context", () => {
  test.prop([fc.integer({ min: 1001, max: 900_000 })], { numRuns: 100 })(
    "middleware attaches an AbortSignal when a deadline signal is present",
    async (remaining) => {
      const middleware = extractHandler();

      const args: FinalizeHandlerArguments<object> = {
        input: {},
        request: { method: "POST", hostname: "localhost", path: "/" },
      };

      let capturedSignal: AbortSignal | undefined;

      /* oxlint-disable typescript/require-await -- async stub */
      const next = async (
        a: FinalizeHandlerArguments<object>,
      ): Promise<FinalizeHandlerOutput<object>> => {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- accessing signal from opaque Smithy request
        capturedSignal = (a.request as { signal?: AbortSignal }).signal;
        return { response: { statusCode: 200 } as object, output: {} as object };
      };
      /* oxlint-enable typescript/require-await */

      const handler = middleware(next, {});
      const context: LambdaContextLike = { getRemainingTimeInMillis: () => remaining };

      await withLambdaDeadline(async () => {
        await handler(args);
      })({}, context);

      expect(capturedSignal).toBeDefined();
      expect(capturedSignal).toBeInstanceOf(AbortSignal);
    },
  );
});
