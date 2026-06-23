// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

import { AsyncLocalStorage } from "node:async_hooks";

import { DeadlineExceededError } from "./error.js";

import type { DeadlineOptions } from "./types.js";

// AsyncLocalStorage propagates the deadline signal through the entire async call chain.
// SDK middleware executes deep in the Smithy stack where we can't pass it through function signatures.
export interface LambdaContextLike {
  getRemainingTimeInMillis?: () => number;
}

interface DeadlineStore {
  signal?: AbortSignal;
}

const contextStorage = new AsyncLocalStorage<DeadlineStore>();

/**
 * Store an external AbortSignal for the current invocation.
 * When set, the SDK middleware uses this signal directly instead of
 * the auto-computed deadline signal.
 *
 * Call this at the start of your handler, before any SDK calls.
 * The signal is scoped to the current async context (AsyncLocalStorage).
 */
export const setDeadlineSignal = (signal: AbortSignal): void => {
  const store = contextStorage.getStore();
  if (store === undefined) {
    throw new Error("setDeadlineSignal() must be called within a withLambdaDeadline() scope");
  }
  store.signal = signal;
};

/**
 * Retrieve the deadline signal for the current invocation, if one exists.
 */
export const getDeadlineSignal = (): AbortSignal | undefined => {
  const store = contextStorage.getStore();
  if (store === undefined) return undefined;
  return store.signal;
};

// Handler wrapper — computes the deadline signal once at invocation start and stores it via AsyncLocalStorage.
type AsyncHandler<TEvent, TContext extends LambdaContextLike, TResult> = (
  event: TEvent,
  context: TContext,
) => Promise<TResult>;

export const withLambdaDeadline =
  <TEvent, TContext extends LambdaContextLike, TResult>(
    handler: AsyncHandler<TEvent, TContext, TResult>,
    options?: DeadlineOptions,
  ): AsyncHandler<TEvent, TContext, TResult> =>
  async (event: TEvent, context: TContext): Promise<TResult> => {
    const store: DeadlineStore = {};

    // Compute the auto-deadline signal once, up front.
    // If the user calls setDeadlineSignal() later, it overwrites this.
    // oxlint-disable-next-line typescript/no-unnecessary-condition -- runtime safety: context may be null/undefined despite types (e.g. untyped callers)
    if (context !== null && context !== undefined) {
      const remaining =
        typeof context.getRemainingTimeInMillis === "function"
          ? context.getRemainingTimeInMillis()
          : undefined;

      if (remaining !== undefined) {
        const rawBuffer = options?.flushBufferMs ?? 1000;
        if (rawBuffer < 0) {
          throw new TypeError(`flushBufferMs option must be non-negative, received: ${rawBuffer}`);
        }

        if (!Number.isFinite(remaining) || !Number.isFinite(rawBuffer)) {
          return contextStorage.run(store, async () => handler(event, context));
        }

        const deadline = Math.floor(remaining - rawBuffer);

        if (deadline <= 0) {
          throw new DeadlineExceededError({
            deadlineMs: 0,
            flushBufferMs: rawBuffer,
            remainingMs: remaining,
          });
        }

        store.signal = AbortSignal.timeout(deadline);
      }
    }

    return contextStorage.run(store, async () => handler(event, context));
  };
