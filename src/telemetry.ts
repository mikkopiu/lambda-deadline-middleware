// SPDX-FileCopyrightText: 2026 lambda-deadline-middleware contributors
// SPDX-License-Identifier: MIT

import type { DeadlineExceededError } from "./error.js";
import type { DeadlineMiddlewareConfig } from "./types.js";

// OpenTelemetry is detected dynamically rather than declared as a peerDependency.
// This avoids forcing all consumers to install @opentelemetry/api or suppress peer warnings.
// Detection happens once at first use and the result is cached for the process lifetime.
interface AbortDetails {
  readonly deadlineMs: number;
  readonly flushBufferMs: number;
  readonly remainingMs: number;
}

interface TelemetryEmitter {
  recordDeadlineAbort: (details: AbortDetails) => void;
  setDeadlineErrorStatus: (error: DeadlineExceededError) => void;
}

let emitter: TelemetryEmitter | undefined;
let detected = false;

const detectEmitter = async (): Promise<TelemetryEmitter | undefined> => {
  if (detected) return emitter;
  detected = true;

  try {
    // Variable indirection prevents TypeScript from resolving the module
    // at compile time — keeps @opentelemetry/api as a purely optional runtime dep.
    const moduleName = "@opentelemetry/api";
    // oxlint-disable-next-line typescript/no-unsafe-assignment -- dynamic import of optional runtime dependency
    const otelApi: Record<string, unknown> = await import(/* webpackIgnore: true */ moduleName);
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- duck-typing optional OTel API surface
    const trace = otelApi["trace"] as { getActiveSpan: () => unknown } | undefined;

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- duck-typing optional OTel API surface
    const SpanStatusCode = otelApi["SpanStatusCode"] as
      | {
          ERROR: number;
        }
      | undefined;

    if (!trace || !SpanStatusCode) {
      emitter = undefined;
      return emitter;
    }

    emitter = {
      recordDeadlineAbort(details: AbortDetails): void {
        try {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- duck-typing OTel span from untyped getActiveSpan()
          const span = trace.getActiveSpan() as Record<string, unknown> | undefined;
          if (!span) return;

          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- duck-typing OTel span.addEvent method
          const addEvent = span["addEvent"] as
            | ((name: string, attributes: Record<string, unknown>) => void)
            | undefined;
          if (typeof addEvent !== "function") return;

          addEvent.call(span, "lambda-deadline-middleware.abort", {
            "deadline.duration_ms": details.deadlineMs,
            "deadline.flush_buffer_ms": details.flushBufferMs,
            "deadline.remaining_ms": details.remainingMs,
          });
        } catch {
          // Telemetry must never disrupt request processing
        }
      },

      setDeadlineErrorStatus(error: DeadlineExceededError): void {
        try {
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- duck-typing OTel span from untyped getActiveSpan()
          const span = trace.getActiveSpan() as Record<string, unknown> | undefined;
          if (!span) return;

          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- duck-typing OTel span.setStatus method
          const setStatus = span["setStatus"] as
            | ((status: { code: number; message: string }) => void)
            | undefined;
          // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- duck-typing OTel span.setAttribute method
          const setAttribute = span["setAttribute"] as
            | ((key: string, value: unknown) => void)
            | undefined;

          if (typeof setStatus === "function") {
            setStatus.call(span, {
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
          }

          if (typeof setAttribute === "function") {
            setAttribute.call(span, "error.type", "DeadlineExceededError");
            setAttribute.call(span, "deadline.duration_ms", error.deadlineMs);
            setAttribute.call(span, "deadline.flush_buffer_ms", error.flushBufferMs);
            setAttribute.call(span, "deadline.remaining_ms", error.remainingMs);
          }
        } catch {
          // Telemetry must never disrupt request processing
        }
      },
    };
  } catch {
    emitter = undefined;
  }

  return emitter;
};

export const emitDeadlineAbort = async (
  error: DeadlineExceededError,
  config: DeadlineMiddlewareConfig,
): Promise<void> => {
  try {
    if (!config.telemetryEnabled) return;

    const em = await detectEmitter();
    if (!em) return;

    em.recordDeadlineAbort({
      deadlineMs: error.deadlineMs,
      flushBufferMs: error.flushBufferMs,
      remainingMs: error.remainingMs,
    });

    em.setDeadlineErrorStatus(error);
  } catch {
    // Telemetry must never disrupt request processing
  }
};
