// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

// Branded type prevents interchange errors at compile time (e.g. passing seconds where milliseconds are expected).
// Zero runtime cost. Smart constructor below validates at the boundary and brands the value.
declare const BrandSymbol: unique symbol;

type Brand<T, B extends string> = T & { readonly [BrandSymbol]: B };

export type Milliseconds = Brand<number, "Milliseconds">;

export const milliseconds = (value: number): Milliseconds => {
  if (!Number.isFinite(value)) {
    throw new TypeError(`milliseconds value must be finite, received: ${value}`);
  }
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- branded type constructor: value is validated above
  return value as Milliseconds;
};

export interface DeadlineOptions {
  readonly flushBufferMs?: number;
}
