import { test } from "@playwright/test";
import {
  pickupAndEscape,
  pickupAndPlace,
  withIsolatedChemistry,
} from "./helpers/chemistry-isolated";

test.describe("S-2.5 stock bottles", () => {
  test.setTimeout(120_000);

  test("water and NaCl use the common Interaction Core", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      await pickupAndEscape(page, "stock-water", canvas, "stock-bottle-target-stock-water");
      await pickupAndEscape(page, "stock-nacl", canvas, "stock-bottle-target-stock-nacl");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });

  test("dangerous HCl bottle", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      await pickupAndEscape(page, "stock-hcl", canvas, "stock-bottle-target-stock-hcl");
      await pickupAndPlace(page, "stock-hcl", canvas, "stock-bottle-target-stock-hcl");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });
});
