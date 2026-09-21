import { describe, expect, it, vi } from "vitest";
import { chainOffloadFollowUps } from "@/lib/offload-chain";

describe("chainOffloadFollowUps", () => {
  it("runs describe then rebuild when a split landed", async () => {
    const calls: string[] = [];
    const steps = {
      describe: vi.fn(async () => {
        calls.push("describe");
      }),
      rebuild: vi.fn(async () => {
        calls.push("rebuild");
      }),
    };

    const ran = await chainOffloadFollowUps(1, steps);

    expect(ran).toBe(true);
    // Order matters: catalog rebuild only after describe resolved.
    expect(calls).toEqual(["describe", "rebuild"]);
    expect(steps.describe).toHaveBeenCalledTimes(1);
    expect(steps.rebuild).toHaveBeenCalledTimes(1);
  });

  it("skips the whole chain when no upload succeeded", async () => {
    const steps = { describe: vi.fn(), rebuild: vi.fn() };

    const ran = await chainOffloadFollowUps(0, steps);

    expect(ran).toBe(false);
    expect(steps.describe).not.toHaveBeenCalled();
    expect(steps.rebuild).not.toHaveBeenCalled();
  });

  it("never runs rebuild if describe rejects, and propagates the error", async () => {
    const steps = {
      describe: vi.fn(async () => {
        throw new Error("no metadata");
      }),
      rebuild: vi.fn(),
    };

    await expect(chainOffloadFollowUps(2, steps)).rejects.toThrow("no metadata");
    expect(steps.rebuild).not.toHaveBeenCalled();
  });

  it("propagates a rebuild failure after a successful describe", async () => {
    const steps = {
      describe: vi.fn(async () => undefined),
      rebuild: vi.fn(async () => {
        throw new Error("rebuild boom");
      }),
    };

    await expect(chainOffloadFollowUps(1, steps)).rejects.toThrow("rebuild boom");
    expect(steps.describe).toHaveBeenCalledTimes(1);
  });
});
