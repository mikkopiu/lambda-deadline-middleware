// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

// Branded types prevent interchange errors at compile time (e.g. passing seconds where milliseconds are expected).
// Zero runtime cost. Smart constructors below validate at the boundary and brand the value.
declare const BrandSymbol: unique symbol;

type Brand<T, B extends string> = T & { readonly [BrandSymbol]: B };

export type Milliseconds = Brand<number, "Milliseconds">;

export type FlushBufferMs = Brand<number, "FlushBufferMs">;

export type RequestDeadlineMs = Brand<number, "RequestDeadlineMs">;

export const milliseconds = (value: number): Milliseconds => {
  if (!Number.isFinite(value)) {
    throw new TypeError(`milliseconds value must be finite, received: ${value}`);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- branded type constructor: value is validated above
  return value as Milliseconds;
};

export const flushBufferMs = (value: number): FlushBufferMs => {
  if (!Number.isFinite(value)) {
    throw new TypeError(`flushBufferMs value must be finite, received: ${value}`);
  }
  if (value < 0) {
    throw new TypeError(`flushBufferMs must be non-negative, received: ${value}`);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- branded type constructor: value is validated above
  return value as FlushBufferMs;
};

export type DeadlineComputation =
  | { readonly kind: "deadline"; readonly value: RequestDeadlineMs }
  | {
      readonly kind: "insufficient-time";
      readonly remaining: Milliseconds;
      readonly buffer: FlushBufferMs;
    }
  | { readonly kind: "no-context" };

export interface DeadlineMiddlewareConfig {
  readonly flushBufferMs: FlushBufferMs;
  readonly telemetryEnabled: boolean;
}

export interface DeadlineOptions {
  readonly flushBufferMs?: number;
  readonly telemetryEnabled?: boolean;
}
