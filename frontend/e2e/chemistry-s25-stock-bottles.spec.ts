import { expect, test } from "@playwright/test";
import {
  dragBetween,
  pickupAndEscape,
  pickupAndPlace,
  withIsolatedChemistry,
} from "./helpers/chemistry-isolated";

test.describe("S-2.5 stock bottles", () => {
  test.setTimeout(120_000);

  test("water and NaCl keep Interaction Core and legacy pour", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      const waterBottle = page.getByTestId("stock-bottle-target-stock-water");
      const naclBottle = page.getByTestId("stock-bottle-target-stock-nacl");
      await expect(waterBottle).toHaveAttribute("data-remaining-grams", "500");
      await expect(naclBottle).toHaveAttribute("data-remaining-grams", "500");
      await pickupAndEscape(page, "stock-water", canvas, "stock-bottle-target-stock-water");
      await pickupAndEscape(page, "stock-nacl", canvas, "stock-bottle-target-stock-nacl");
      await dragBetween(page, "stock-bottle-target-stock-water", "container-drop-zone-water-beaker-1");
      await expect(page.getByTestId("container-target-beaker-1")).toHaveAttribute("data-water-grams", "100");
      await expect(waterBottle).toHaveAttribute("data-remaining-grams", "400");
      await dragBetween(page, "stock-bottle-target-stock-nacl", "container-drop-zone-reagent-beaker-1");
      await expect(page.getByTestId("container-target-beaker-1")).toHaveAttribute(
        "data-nacl-dissolved-grams",
        "20"
      );
      await expect(naclBottle).toHaveAttribute("data-remaining-grams", "480");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });

  test("dangerous HCl bottle", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      await pickupAndEscape(page, "stock-hcl", canvas, "stock-bottle-target-stock-hcl");
      await pickupAndPlace(page, "stock-hcl", canvas, "stock-bottle-target-stock-hcl");
    }, { viewport: { width: 1280, height: 720 }, screenshot: false });
  });
});
