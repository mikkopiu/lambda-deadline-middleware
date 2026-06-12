// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

import type { Pluggable } from "@smithy/types";

import { parseConfig } from "./config.js";
import { deadlineMiddlewareHandler } from "./middleware.js";
import type { DeadlineOptions } from "./types.js";

export const deadlineMiddleware = <Input extends object, Output extends object>(
  options?: DeadlineOptions,
): Pluggable<Input, Output> => {
  const config = parseConfig(options);

  return {
    applyToStack(stack) {
      // Registered at "finalizeRequest" (attempt level) rather than API-call level so each retry gets a deadline
      // computed from the actual remaining time at that moment. API-call level would cache a stale deadline
      // across retries, which grow more dangerous after backoff delays eat into remaining time.
      stack.add(deadlineMiddlewareHandler<Input, Output>(config), {
        step: "finalizeRequest",
        name: "deadlineMiddleware",
        override: true,
      });
    },
  };
};
