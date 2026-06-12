// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

import { flushBufferMs } from "./types.js";
import type { DeadlineMiddlewareConfig, DeadlineOptions } from "./types.js";

// "Parse, don't validate": config is validated once here and returned as branded types.
// Internal code can't receive unvalidated values. Invalid config throws TypeError at startup, not during requests.
export const parseConfig = (raw: DeadlineOptions | undefined): DeadlineMiddlewareConfig => {
  const buffer = raw?.flushBufferMs ?? 1000;
  if (buffer < 0) {
    throw new TypeError(`flushBufferMs option must be non-negative, received: ${buffer}`);
  }
  return {
    flushBufferMs: flushBufferMs(buffer),
    telemetryEnabled: raw?.telemetryEnabled ?? true,
  };
};
