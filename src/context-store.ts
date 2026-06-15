// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

import { AsyncLocalStorage } from "node:async_hooks";

// AsyncLocalStorage propagates the Lambda context through the entire async call chain without parameter threading.
// SDK middleware executes deep in the Smithy stack where we can't pass the context through function signatures.
export interface LambdaContextLike {
  getRemainingTimeInMillis?: () => number;
}

const contextStorage = new AsyncLocalStorage<LambdaContextLike>();

export const run = <T>(context: LambdaContextLike | null | undefined, fn: () => T): T => {
  if (context === null || context === undefined) return fn();
  return contextStorage.run(context, fn);
};

export const getRemainingTimeInMillis = (): number | undefined => {
  const store = contextStorage.getStore();
  if (store === undefined) return undefined;
  if (typeof store.getRemainingTimeInMillis !== "function") return undefined;
  return store.getRemainingTimeInMillis();
};
