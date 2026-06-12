// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

export { withLambdaDeadline } from "./handler-wrapper.js";
export { deadlineMiddleware } from "./registration.js";
export { DeadlineExceededError, isDeadlineExceeded } from "./error.js";
export { getRemainingTimeInMillis } from "./context-store.js";

export type {
  Milliseconds,
  FlushBufferMs,
  RequestDeadlineMs,
  DeadlineComputation,
  DeadlineMiddlewareConfig,
  DeadlineOptions,
} from "./types.js";

export type { LambdaContextLike } from "./context-store.js";
