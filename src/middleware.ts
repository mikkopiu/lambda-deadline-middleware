// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

import type {
  FinalizeHandler,
  FinalizeHandlerArguments,
  FinalizeHandlerOutput,
  HandlerExecutionContext,
  Pluggable,
} from "@smithy/types";

import { getDeadlineSignal } from "./context-store.js";

export const deadlineMiddleware = <Input extends object, Output extends object>(): Pluggable<
  Input,
  Output
> => ({
  applyToStack(stack) {
    stack.add(
      (
        next: FinalizeHandler<Input, Output>,
        _context: HandlerExecutionContext,
      ): FinalizeHandler<Input, Output> =>
        async (args: FinalizeHandlerArguments<Input>): Promise<FinalizeHandlerOutput<Output>> => {
          const deadlineSignal = getDeadlineSignal();
          if (deadlineSignal === undefined) return next(args);

          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- Smithy request is an opaque object
          const request = args.request as { signal?: AbortSignal } | undefined;
          const existing = request?.signal;
          const signal = existing ? AbortSignal.any([existing, deadlineSignal]) : deadlineSignal;

          return next({
            ...args,
            // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- spreading opaque Smithy request to add signal
            request: { ...(args.request as object), signal },
          });
        },
      {
        step: "finalizeRequest",
        name: "deadlineMiddleware",
        override: true,
      },
    );
  },
});
