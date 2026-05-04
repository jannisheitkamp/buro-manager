import { test, expect } from '@playwright/test';

test('has title and login page loads', async ({ page }) => {
  await page.goto('/');

  // Expect the title to contain "Büro Manager" or redirect to login
  await expect(page).toHaveTitle(/Büro Manager/i);

  // Expect to see the login form
  await expect(page.locator('text=Willkommen zurück')).toBeVisible();
});