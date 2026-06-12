import { describe, it, expect } from "vitest";
import { parseConfig } from "../../src/config.js";

describe("parseConfig", () => {
  it("returns default flushBufferMs of 1000 when undefined", () => {
    const config = parseConfig(undefined);
    expect(config.flushBufferMs).toBe(1000);
  });

  it("returns default flushBufferMs of 1000 when options is empty object", () => {
    const config = parseConfig({});
    expect(config.flushBufferMs).toBe(1000);
  });

  it("uses provided flushBufferMs value", () => {
    const config = parseConfig({ flushBufferMs: 500 });
    expect(config.flushBufferMs).toBe(500);
  });

  it("accepts zero for flushBufferMs", () => {
    const config = parseConfig({ flushBufferMs: 0 });
    expect(config.flushBufferMs).toBe(0);
  });

  it("throws TypeError for negative flushBufferMs", () => {
    expect(() => parseConfig({ flushBufferMs: -1 })).toThrow(TypeError);
  });

  it("throws TypeError with descriptive message including the value", () => {
    expect(() => parseConfig({ flushBufferMs: -5 })).toThrow(
      "flushBufferMs option must be non-negative",
    );
    expect(() => parseConfig({ flushBufferMs: -5 })).toThrow("-5");
  });

  it("does not throw for non-negative values", () => {
    expect(() => parseConfig({ flushBufferMs: -100 })).toThrow(
      "flushBufferMs option must be non-negative",
    );
    expect(() => parseConfig({ flushBufferMs: 0 })).not.toThrow();
  });

  it("returns telemetryEnabled defaulting to true when undefined", () => {
    const config = parseConfig(undefined);
    expect(config.telemetryEnabled).toBe(true);
  });

  it("returns telemetryEnabled defaulting to true when not specified", () => {
    const config = parseConfig({});
    expect(config.telemetryEnabled).toBe(true);
  });

  it("returns telemetryEnabled as false when explicitly set to false", () => {
    const config = parseConfig({ telemetryEnabled: false });
    expect(config.telemetryEnabled).toBe(false);
  });

  it("returns telemetryEnabled as true when explicitly set to true", () => {
    const config = parseConfig({ telemetryEnabled: true });
    expect(config.telemetryEnabled).toBe(true);
  });

  it("throw statement is reachable for negative values", () => {
    let thrown = false;
    try {
      parseConfig({ flushBufferMs: -1 });
    } catch {
      thrown = true;
    }
    expect(thrown).toBe(true);
  });
});
