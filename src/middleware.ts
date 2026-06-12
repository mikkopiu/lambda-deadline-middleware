// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

import { getRemainingTimeInMillis } from "./context-store.js";
import { DeadlineExceededError } from "./error.js";
import type { DeadlineComputation, DeadlineMiddlewareConfig, RequestDeadlineMs } from "./types.js";
import { milliseconds } from "./types.js";

import type {
  FinalizeHandler,
  FinalizeHandlerArguments,
  FinalizeHandlerOutput,
  FinalizeRequestMiddleware,
  HandlerExecutionContext,
} from "@smithy/types";

export const computeDeadline = (config: DeadlineMiddlewareConfig): DeadlineComputation => {
  const remaining = getRemainingTimeInMillis();

  if (remaining === undefined) {
    return { kind: "no-context" };
  }

  const deadline = remaining - config.flushBufferMs;

  if (deadline <= 0) {
    return {
      kind: "insufficient-time",
      remaining: milliseconds(remaining),
      buffer: config.flushBufferMs,
    };
  }

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- branded narrowing: deadline is validated > 0 above
  return { kind: "deadline", value: deadline as RequestDeadlineMs };
};

export interface DeadlineTimer {
  readonly controller: AbortController;
  [Symbol.dispose]: () => void;
}

export const createDeadlineTimer = (
  deadlineMs: RequestDeadlineMs,
  config: DeadlineMiddlewareConfig,
): DeadlineTimer => {
  const controller = new AbortController();
  const remaining = milliseconds(deadlineMs + config.flushBufferMs);
  const error = new DeadlineExceededError({
    deadlineMs: milliseconds(deadlineMs),
    flushBufferMs: config.flushBufferMs,
    remainingMs: remaining,
  });
  const timeoutId = setTimeout(() => {
    controller.abort(error);
  }, deadlineMs);
  return {
    controller,
    [Symbol.dispose]() {
      clearTimeout(timeoutId);
    },
  };
};

export const composeSignals = (
  existing: AbortSignal | undefined,
  deadline: AbortSignal,
): AbortSignal => {
  if (existing === undefined) return deadline;
  return AbortSignal.any([existing, deadline]);
};

export const deadlineMiddlewareHandler =
  <Input extends object, Output extends object>(
    config: DeadlineMiddlewareConfig,
  ): FinalizeRequestMiddleware<Input, Output> =>
  (
    next: FinalizeHandler<Input, Output>,
    _context: HandlerExecutionContext,
  ): FinalizeHandler<Input, Output> =>
  // oxlint-disable-next-line typescript/consistent-return -- switch is exhaustive over DeadlineComputation discriminated union
  async (args: FinalizeHandlerArguments<Input>): Promise<FinalizeHandlerOutput<Output>> => {
    const computation = computeDeadline(config);

    switch (computation.kind) {
      case "no-context":
        return next(args);

      case "insufficient-time":
        throw new DeadlineExceededError({
          deadlineMs: milliseconds(0),
          flushBufferMs: computation.buffer,
          remainingMs: computation.remaining,
        });

      case "deadline": {
        // `using` guarantees cleanup (clearTimeout) even if next() throws, the promise rejects,
        // or an external abort signal fires — strictly more reliable than try/finally.
        using timer = createDeadlineTimer(computation.value, config);
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Smithy request is an opaque object; we access optional signal property
        const request = args.request as { signal?: AbortSignal } | undefined;
        const signal = composeSignals(request?.signal, timer.controller.signal);
        const result = await next({
          ...args,
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- spreading opaque Smithy request to add signal
          request: { ...(args.request as object), signal },
        });
        return result;
      }
    }
  };
