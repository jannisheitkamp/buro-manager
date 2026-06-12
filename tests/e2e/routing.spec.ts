import { test, expect } from '@playwright/test';

test.describe('Dashboard und Navigation', () => {
  test('App lädt und zeigt Login für unauthentifizierte Nutzer', async ({ page }) => {
    await page.goto('/');
    
    // Prüfen, ob der Login-Titel gerendert wird
    const heading = page.locator('h2', { hasText: 'Willkommen zurück' });
    await expect(heading).toBeVisible();

    // Prüfen, ob Email und Passwort Felder existieren
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test('Navigation zu geschützten Routen leitet um', async ({ page }) => {
    // Versuch, direkt auf /production zuzugreifen
    await page.goto('/production');
    
    // Sollte zurück zum Login leiten, da kein Session-Cookie existiert
    await expect(page).toHaveURL(/.*login.*/);
  });
});
