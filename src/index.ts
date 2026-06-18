// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

export { withLambdaDeadline, setDeadlineSignal } from "./context-store.js";
export { deadlineMiddleware } from "./middleware.js";
export { DeadlineExceededError, isDeadlineExceeded } from "./error.js";

export type { DeadlineOptions } from "./types.js";
export type { LambdaContextLike } from "./context-store.js";
