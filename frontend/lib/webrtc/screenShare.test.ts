// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acquireScreenStream, isScreenShareSupported, ScreenShareAcquisitionError } from "./screenShare";

describe("isScreenShareSupported", () => {
  afterEach(() => {
    Object.defineProperty(navigator, "mediaDevices", { value: undefined, configurable: true });
  });

  it("is false when the browser has no getDisplayMedia", () => {
    Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
    expect(isScreenShareSupported()).toBe(false);
  });

  it("is true when getDisplayMedia exists", () => {
    Object.defineProperty(navigator, "mediaDevices", { value: { getDisplayMedia: vi.fn() }, configurable: true });
    expect(isScreenShareSupported()).toBe(true);
  });
});

describe("acquireScreenStream", () => {
  it("requests video only, never tab/system audio (brief §15 — avoids echo/duplicated audio)", async () => {
    const getDisplayMedia = vi.fn().mockResolvedValue({} as MediaStream);
    Object.defineProperty(navigator, "mediaDevices", { value: { getDisplayMedia }, configurable: true });

    await acquireScreenStream();
    expect(getDisplayMedia).toHaveBeenCalledWith({ video: true, audio: false });
  });

  it("throws a 'failed' error when the browser has no getDisplayMedia at all", async () => {
    Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
    await expect(acquireScreenStream()).rejects.toMatchObject({ reason: "failed" });
  });

  describe.each([
    ["NotAllowedError", "cancelled"],
    ["AbortError", "cancelled"],
    ["NotReadableError", "failed"],
    ["InvalidStateError", "failed"],
    ["SomeOtherError", "failed"],
  ] as const)("maps %s to reason %s", (errorName, expectedReason) => {
    beforeEach(() => {
      const err = new Error("boom");
      err.name = errorName;
      const getDisplayMedia = vi.fn().mockRejectedValue(err);
      Object.defineProperty(navigator, "mediaDevices", { value: { getDisplayMedia }, configurable: true });
    });

    it(`rejects with ScreenShareAcquisitionError(reason="${expectedReason}")`, async () => {
      await expect(acquireScreenStream()).rejects.toBeInstanceOf(ScreenShareAcquisitionError);
      await expect(acquireScreenStream()).rejects.toMatchObject({ reason: expectedReason });
    });
  });
});
