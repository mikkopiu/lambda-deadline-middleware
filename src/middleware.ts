// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

import type {
  FinalizeHandler,
  FinalizeHandlerArguments,
  FinalizeHandlerOutput,
  HandlerExecutionContext,
  Pluggable,
} from "@smithy/types";

import { getRemainingTimeInMillis } from "./context-store.js";
import { DeadlineExceededError } from "./error.js";
import { milliseconds } from "./types.js";

import type { DeadlineOptions } from "./types.js";

export const composeSignals = (
  existing: AbortSignal | undefined,
  deadline: AbortSignal,
): AbortSignal => {
  if (existing === undefined) return deadline;
  return AbortSignal.any([existing, deadline]);
};

export const deadlineMiddleware = <Input extends object, Output extends object>(
  options?: DeadlineOptions,
): Pluggable<Input, Output> => {
  const raw = options?.flushBufferMs ?? 1000;
  if (raw < 0) {
    throw new TypeError(`flushBufferMs option must be non-negative, received: ${raw}`);
  }
  const flushBufferMs = milliseconds(raw);

  return {
    applyToStack(stack) {
      // Registered at "finalizeRequest" (attempt level) rather than API-call level so each retry gets a deadline
      // computed from the actual remaining time at that moment. API-call level would cache a stale deadline
      // across retries, which grow more dangerous after backoff delays eat into remaining time.
      stack.add(
        (
          next: FinalizeHandler<Input, Output>,
          _context: HandlerExecutionContext,
        ): FinalizeHandler<Input, Output> =>
          async (args: FinalizeHandlerArguments<Input>): Promise<FinalizeHandlerOutput<Output>> => {
            const remaining = getRemainingTimeInMillis();
            if (remaining === undefined) return next(args);

            const deadline = remaining - flushBufferMs;

            if (deadline <= 0) {
              throw new DeadlineExceededError({
                deadlineMs: milliseconds(0),
                flushBufferMs,
                remainingMs: milliseconds(remaining),
              });
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
              controller.abort(
                new DeadlineExceededError({
                  deadlineMs: milliseconds(deadline),
                  flushBufferMs,
                  remainingMs: milliseconds(remaining),
                }),
              );
            }, deadline);

            // `using` guarantees cleanup (clearTimeout) even if next() throws, the promise rejects,
            // or an external abort signal fires — strictly more reliable than try/finally.
            using _timer = {
              [Symbol.dispose]() {
                clearTimeout(timeoutId);
              },
            };

            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Smithy request is an opaque object; we access optional signal property
            const request = args.request as { signal?: AbortSignal } | undefined;
            const signal = composeSignals(request?.signal, controller.signal);
            const result = await next({
              ...args,
              // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- spreading opaque Smithy request to add signal
              request: { ...(args.request as object), signal },
            });
            return result;
          },
        {
          step: "finalizeRequest",
          name: "deadlineMiddleware",
          override: true,
        },
      );
    },
  };
};
