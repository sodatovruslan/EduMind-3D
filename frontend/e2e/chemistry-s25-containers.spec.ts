import { test } from "@playwright/test";
import {
  pickupAndEscape,
  pickupAndPlace,
  withIsolatedChemistry,
} from "./helpers/chemistry-isolated";

test.describe("S-2.5 containers", () => {
  test.setTimeout(120_000);

  test("beaker", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      await pickupAndEscape(page, "beaker-1", canvas);
      await pickupAndPlace(page, "beaker-1", canvas);
    });
  });

  test("flask", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      await pickupAndEscape(page, "flask-1", canvas);
      await pickupAndPlace(page, "flask-1", canvas);
    });
  });

  test("test tube", async ({}, testInfo) => {
    await withIsolatedChemistry(testInfo, async ({ page, canvas }) => {
      await pickupAndEscape(page, "test-tube-1", canvas);
      await pickupAndPlace(page, "test-tube-1", canvas);
    });
  });
});
