import { expect, test } from "@playwright/test";
import { Connector, MemoryIdentityStore, PairingRequiredError } from "../../../../@citadela/connector/dist/index.js";

test("creates a profile and navigates between Dashboard and Devices through the real Hub", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Create your Citadela profile" })).toBeVisible();
  await page.getByLabel("Password").fill("a-very-strong-password");
  await page.getByRole("button", { name: "Create profile" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" }).last()).toBeVisible();
  await expect(page.getByText("Files")).not.toBeVisible();
  await expect(page.getByText("Containers")).not.toBeVisible();

  await page.getByText("Devices", { exact: true }).first().click();
  await expect(page).toHaveURL(/\/devices$/);
  await expect(page.getByRole("heading", { name: "Devices" }).last()).toBeVisible();
  await expect(page.getByText("No devices connected.")).toBeVisible();

  const connector = new Connector({
    url: "ws://127.0.0.1:4175",
    deviceId: "e2e-raspberry",
    identityStore: new MemoryIdentityStore(),
    autoReconnect: false,
  });
  try {
    await expect(connector.connect()).rejects.toBeInstanceOf(PairingRequiredError);
    await expect(page.getByText("e2e-raspberry")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: "Approve" }).click();
    await connector.connect();
    await expect(page.getByText("Connected", { exact: true }).last()).toBeVisible();
    await expect(page.getByText("No pending pairing requests.")).toBeVisible();
    await page.getByRole("button", { name: "e2e-raspberry" }).click();
    await expect(page).toHaveURL(/\/devices\/e2e-raspberry$/);
    await expect(page.getByRole("heading", { name: "e2e-raspberry" })).toBeVisible();
    await expect(page.getByText("Hostname")).toBeVisible();
    await page.getByRole("button", { name: "Restart" }).click();
    const confirmation = page.getByRole("dialog", { name: "Restart device?" });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole("button", { name: "Restart", exact: true }).click();
    await expect(page.getByRole("status")).toContainText("dispatched");
    await expect(page.getByRole("list", { name: "Command history" })).toContainText("device.system.power.restart");
  } finally {
    connector.close();
  }
});
