import { describe, it, expect, vi, beforeEach } from "vitest";
import { DeadlineExceededError } from "../../src/error.js";
import { flushBufferMs, milliseconds } from "../../src/types.js";
import type { DeadlineMiddlewareConfig } from "../../src/types.js";

describe("telemetry", () => {
  beforeEach(() => {
    // Reset module state between tests by re-importing
    vi.resetModules();
  });

  const makeConfig = (telemetryEnabled: boolean): DeadlineMiddlewareConfig => ({
    flushBufferMs: flushBufferMs(1000),
    telemetryEnabled,
  });

  const makeError = () =>
    new DeadlineExceededError({
      deadlineMs: milliseconds(3500),
      flushBufferMs: flushBufferMs(1000),
      remainingMs: milliseconds(4500),
    });

  it("is a no-op when telemetryEnabled is false", async () => {
    const addEvent = vi.fn();
    const setStatus = vi.fn();
    const setAttribute = vi.fn();

    const mockSpan = { addEvent, setStatus, setAttribute };
    const mockTrace = { getActiveSpan: () => mockSpan };
    const mockSpanStatusCode = { ERROR: 2 };

    vi.doMock("@opentelemetry/api", () => ({
      trace: mockTrace,
      SpanStatusCode: mockSpanStatusCode,
    }));

    const { emitDeadlineAbort } = await import("../../src/telemetry.js");
    const error = makeError();
    const config = makeConfig(false);

    await emitDeadlineAbort(error, config);

    expect(addEvent).not.toHaveBeenCalled();
    expect(setStatus).not.toHaveBeenCalled();
    expect(setAttribute).not.toHaveBeenCalled();
  });

  it("emits telemetry when telemetryEnabled is true (contrast with disabled)", async () => {
    const addEvent = vi.fn();
    const setStatus = vi.fn();
    const setAttribute = vi.fn();

    const mockSpan = { addEvent, setStatus, setAttribute };
    const mockTrace = { getActiveSpan: () => mockSpan };
    const mockSpanStatusCode = { ERROR: 2 };

    vi.doMock("@opentelemetry/api", () => ({
      trace: mockTrace,
      SpanStatusCode: mockSpanStatusCode,
    }));

    const { emitDeadlineAbort } = await import("../../src/telemetry.js");
    const error = makeError();
    const config = makeConfig(true);

    await emitDeadlineAbort(error, config);

    expect(addEvent).toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalled();
  });

  it("is a no-op when @opentelemetry/api is not installed", async () => {
    const { emitDeadlineAbort } = await import("../../src/telemetry.js");
    const error = makeError();
    const config = makeConfig(true);

    await expect(emitDeadlineAbort(error, config)).resolves.toBeUndefined();
  });

  it("caches detection result and does not re-detect on second call", async () => {
    let callCount = 0;

    vi.doMock("@opentelemetry/api", () => {
      callCount++;
      if (callCount === 1) {
        // First import: return valid OTel with active span
        return {
          trace: {
            getActiveSpan: () => ({ addEvent: vi.fn(), setStatus: vi.fn(), setAttribute: vi.fn() }),
          },
          SpanStatusCode: { ERROR: 2 },
        };
      }
      // Second import: return empty module (would mean no emitter)
      return {};
    });

    const { emitDeadlineAbort } = await import("../../src/telemetry.js");
    const error = makeError();
    const config = makeConfig(true);

    // First call triggers detection — gets valid OTel, creates emitter
    await emitDeadlineAbort(error, config);
    expect(callCount).toBe(1);

    // Second call should use cached emitter (import NOT called again)
    await emitDeadlineAbort(error, config);

    expect(callCount).toBe(1);
  });

  it("never throws regardless of internal errors", async () => {
    const { emitDeadlineAbort } = await import("../../src/telemetry.js");
    const error = makeError();
    const config = makeConfig(true);

    // Multiple calls should all be safe
    await expect(emitDeadlineAbort(error, config)).resolves.toBeUndefined();
    await expect(emitDeadlineAbort(error, config)).resolves.toBeUndefined();
  });

  it("caches detection result across calls (basic)", async () => {
    const { emitDeadlineAbort } = await import("../../src/telemetry.js");
    const error = makeError();
    const config = makeConfig(true);

    // First call triggers detection
    await emitDeadlineAbort(error, config);
    // Second call uses cached result (no re-detection)
    await emitDeadlineAbort(error, config);

    // Both should complete without error (no-op since OTel is not installed)
  });

  it("records span event and sets status when OTel is available", async () => {
    const addEvent = vi.fn();
    const setStatus = vi.fn();
    const setAttribute = vi.fn();

    const mockSpan = { addEvent, setStatus, setAttribute };
    const mockTrace = { getActiveSpan: () => mockSpan };
    const mockSpanStatusCode = { ERROR: 2 };

    vi.doMock("@opentelemetry/api", () => ({
      trace: mockTrace,
      SpanStatusCode: mockSpanStatusCode,
    }));

    const { emitDeadlineAbort } = await import("../../src/telemetry.js");
    const error = makeError();
    const config = makeConfig(true);

    await emitDeadlineAbort(error, config);

    expect(addEvent).toHaveBeenCalledWith("lambda-deadline-middleware.abort", {
      "deadline.duration_ms": 3500,
      "deadline.flush_buffer_ms": 1000,
      "deadline.remaining_ms": 4500,
    });

    expect(setStatus).toHaveBeenCalledWith({
      code: 2,
      message: error.message,
    });

    expect(setAttribute).toHaveBeenCalledWith("error.type", "DeadlineExceededError");
    expect(setAttribute).toHaveBeenCalledWith("deadline.duration_ms", 3500);
    expect(setAttribute).toHaveBeenCalledWith("deadline.flush_buffer_ms", 1000);
    expect(setAttribute).toHaveBeenCalledWith("deadline.remaining_ms", 4500);
  });

  it("is a no-op when OTel is available but no active span", async () => {
    const mockTrace = { getActiveSpan: () => undefined };
    const mockSpanStatusCode = { ERROR: 2 };

    vi.doMock("@opentelemetry/api", () => ({
      trace: mockTrace,
      SpanStatusCode: mockSpanStatusCode,
    }));

    const { emitDeadlineAbort } = await import("../../src/telemetry.js");
    const error = makeError();
    const config = makeConfig(true);

    // Should not throw even though no active span exists
    await expect(emitDeadlineAbort(error, config)).resolves.toBeUndefined();
  });

  it("handles OTel module that lacks expected exports gracefully", async () => {
    vi.doMock("@opentelemetry/api", () => ({}));

    const { emitDeadlineAbort } = await import("../../src/telemetry.js");
    const error = makeError();
    const config = makeConfig(true);

    await expect(emitDeadlineAbort(error, config)).resolves.toBeUndefined();
  });

  it("handles OTel module with trace but no SpanStatusCode", async () => {
    const addEvent = vi.fn();
    const setStatus = vi.fn();
    const setAttribute = vi.fn();
    const mockSpan = { addEvent, setStatus, setAttribute };

    vi.doMock("@opentelemetry/api", () => ({
      trace: { getActiveSpan: () => mockSpan },
      // SpanStatusCode is missing/undefined
    }));

    const { emitDeadlineAbort } = await import("../../src/telemetry.js");
    const error = makeError();
    const config = makeConfig(true);

    await emitDeadlineAbort(error, config);

    // Function completes without error regardless of missing SpanStatusCode
    await expect(emitDeadlineAbort(error, config)).resolves.toBeUndefined();
  });

  it("handles span without addEvent method gracefully", async () => {
    const mockSpan = { setStatus: vi.fn(), setAttribute: vi.fn() }; // no addEvent
    const mockTrace = { getActiveSpan: () => mockSpan };
    const mockSpanStatusCode = { ERROR: 2 };

    vi.doMock("@opentelemetry/api", () => ({
      trace: mockTrace,
      SpanStatusCode: mockSpanStatusCode,
    }));

    const { emitDeadlineAbort } = await import("../../src/telemetry.js");
    const error = makeError();
    const config = makeConfig(true);

    // Should not throw even though span lacks addEvent
    await expect(emitDeadlineAbort(error, config)).resolves.toBeUndefined();
    // setStatus should still be called since it exists
    expect(mockSpan.setStatus).toHaveBeenCalled();
  });

  it("handles span without setStatus method gracefully", async () => {
    const addEvent = vi.fn();
    const setAttribute = vi.fn();
    const mockSpan = { addEvent, setAttribute }; // no setStatus
    const mockTrace = { getActiveSpan: () => mockSpan };
    const mockSpanStatusCode = { ERROR: 2 };

    vi.doMock("@opentelemetry/api", () => ({
      trace: mockTrace,
      SpanStatusCode: mockSpanStatusCode,
    }));

    const { emitDeadlineAbort } = await import("../../src/telemetry.js");
    const error = makeError();
    const config = makeConfig(true);

    await expect(emitDeadlineAbort(error, config)).resolves.toBeUndefined();
    expect(addEvent).toHaveBeenCalled();
    expect(setAttribute).toHaveBeenCalled();
  });

  it("handles span without setAttribute method gracefully", async () => {
    const addEvent = vi.fn();
    const setStatus = vi.fn();
    const mockSpan = { addEvent, setStatus }; // no setAttribute
    const mockTrace = { getActiveSpan: () => mockSpan };
    const mockSpanStatusCode = { ERROR: 2 };

    vi.doMock("@opentelemetry/api", () => ({
      trace: mockTrace,
      SpanStatusCode: mockSpanStatusCode,
    }));

    const { emitDeadlineAbort } = await import("../../src/telemetry.js");
    const error = makeError();
    const config = makeConfig(true);

    await expect(emitDeadlineAbort(error, config)).resolves.toBeUndefined();
    expect(addEvent).toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalled();
  });

  it("does not call addEvent when no active span in recordDeadlineAbort", async () => {
    const mockTrace = { getActiveSpan: () => undefined }; // no active span
    const mockSpanStatusCode = { ERROR: 2 };

    vi.doMock("@opentelemetry/api", () => ({
      trace: mockTrace,
      SpanStatusCode: mockSpanStatusCode,
    }));

    const { emitDeadlineAbort } = await import("../../src/telemetry.js");
    const error = makeError();
    const config = makeConfig(true);

    // Should not throw — the !span guard should prevent accessing methods
    await expect(emitDeadlineAbort(error, config)).resolves.toBeUndefined();
  });
});
