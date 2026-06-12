import { describe, it, expect, vi } from "vitest";
import { deadlineMiddleware } from "../../src/registration.js";

describe("deadlineMiddleware", () => {
  it("returns a Pluggable with applyToStack method", () => {
    const pluggable = deadlineMiddleware();
    expect(pluggable.applyToStack).toBeInstanceOf(Function);
  });

  it("registers middleware at finalizeRequest step with name 'deadlineMiddleware'", () => {
    const pluggable = deadlineMiddleware();
    const add = vi.fn();
    const stack = { add };

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- minimal mock satisfying complex Pluggable interface
    pluggable.applyToStack(stack as never);

    expect(add).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        step: "finalizeRequest",
        name: "deadlineMiddleware",
        override: true,
      }),
    );
  });
});
