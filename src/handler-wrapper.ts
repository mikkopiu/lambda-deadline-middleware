// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

import { run } from "./context-store.js";

import type { LambdaContextLike } from "./context-store.js";

type AsyncHandler<TEvent, TContext extends LambdaContextLike, TResult> = (
  event: TEvent,
  context: TContext,
) => Promise<TResult>;

export const withLambdaDeadline =
  <TEvent, TContext extends LambdaContextLike, TResult>(
    handler: AsyncHandler<TEvent, TContext, TResult>,
  ): AsyncHandler<TEvent, TContext, TResult> =>
  async (event: TEvent, context: TContext): Promise<TResult> =>
    run(context, async () => handler(event, context));
