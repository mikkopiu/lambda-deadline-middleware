// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

import { AsyncLocalStorage } from "node:async_hooks";

// AsyncLocalStorage propagates the Lambda context through the entire async call chain without parameter threading.
// SDK middleware executes deep in the Smithy stack where we can't pass the context through function signatures.
export interface LambdaContextLike {
  getRemainingTimeInMillis?: () => number;
}

// Sentinel allows AsyncLocalStorage.run() to accept null/undefined context
// without throwing, while the accessor can distinguish "no context stored"
// from "context present but missing the method".
const NO_CONTEXT: unique symbol = Symbol("no-context");

type StoreValue = LambdaContextLike | typeof NO_CONTEXT;

const contextStorage = new AsyncLocalStorage<StoreValue>();

export const run = <T>(context: LambdaContextLike | null | undefined, fn: () => T): T => {
  const value: StoreValue = context ?? NO_CONTEXT;
  return contextStorage.run(value, fn);
};

export const getRemainingTimeInMillis = (): number | undefined => {
  const store = contextStorage.getStore();

  if (store === undefined || store === NO_CONTEXT) {
    return undefined;
  }

  if (typeof store.getRemainingTimeInMillis !== "function") {
    return undefined;
  }

  return store.getRemainingTimeInMillis();
};
