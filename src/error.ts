// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

interface DeadlineExceededInit {
  readonly deadlineMs: number;
  readonly flushBufferMs: number;
  readonly remainingMs: number;
}

export class DeadlineExceededError extends Error {
  override readonly name = "DeadlineExceededError" as const;
  readonly deadlineMs: number;
  readonly flushBufferMs: number;
  readonly remainingMs: number;

  constructor(init: DeadlineExceededInit) {
    super(
      `Request deadline exceeded: ${init.deadlineMs}ms deadline (${init.flushBufferMs}ms flush buffer)`,
    );
    this.deadlineMs = init.deadlineMs;
    this.flushBufferMs = init.flushBufferMs;
    this.remainingMs = init.remainingMs;
  }
}

// Structural check rather than instanceof — works across module boundaries
// and serialization boundaries where prototype chain may be broken.
export const isDeadlineExceeded = (error: unknown): error is DeadlineExceededError => {
  if (error === null || error === undefined) return false;
  if (typeof error !== "object") return false;
  return (error as { name?: unknown }).name === "DeadlineExceededError";
};
