// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

import { run } from "./context-store.js";
import type { LambdaContextLike } from "./context-store.js";
import type { DeadlineOptions } from "./types.js";

type AsyncHandler<TEvent, TResult> = (
  event: TEvent,
  context: LambdaContextLike,
) => Promise<TResult>;

export const withLambdaDeadline =
  <TEvent, TResult>(
    handler: AsyncHandler<TEvent, TResult>,
    _options?: DeadlineOptions,
  ): AsyncHandler<TEvent, TResult> =>
  async (event: TEvent, context: LambdaContextLike): Promise<TResult> =>
    run(context, async () => handler(event, context));
