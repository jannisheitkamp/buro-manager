import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

// Läuft gegen die Demo (VITE_DEMO=true): erfundene Daten, alles bleibt im Browser
const here = path.dirname(fileURLToPath(import.meta.url));
const csv = path.join(here, 'fixtures', 'kunden.csv');

test.describe('Kunden', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/customers');
    await expect(page.getByRole('heading', { name: 'Kunden', exact: true })).toBeVisible();
  });

  test('Import: Spalten werden erkannt, Dubletten beim zweiten Mal übersprungen', async ({ page }) => {
    const runImport = async () => {
      await page.getByRole('button', { name: 'Import' }).click();
      const chooser = page.waitForEvent('filechooser');
      await page.getByText('Datei wählen oder hierher ziehen').click();
      await (await chooser).setFiles(csv);
      await expect(page.getByText('Spalten zuordnen')).toBeVisible();
      await page.getByRole('button', { name: 'Weiter zur Vorschau' }).click();
    };

    await runImport();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Testmann, Tina')).toBeVisible();
    await expect(dialog.getByText('PHV, HR')).toBeVisible();
    await dialog.getByRole('button', { name: 'Jetzt importieren' }).click();
    await expect(dialog.getByText('3 neue Kunden, 0 ergänzt, 3 Bestandsverträge.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Fertig' }).click();

    // Importierte Kunden gehören der Person, die importiert hat, und stehen unter „Meine“
    await expect(page.getByRole('button', { name: /^Testmann, Tina/ })).toBeVisible();

    await runImport();
    await expect(dialog.getByText('Nichts zu tun')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Jetzt importieren' })).toBeDisabled();
  });

  test('Lückenliste: filtern und Rückrufe in Serie anlegen', async ({ page }) => {
    await page.getByRole('tab', { name: /^Lücken/ }).click();
    const chip = page.getByRole('button', { name: /^PHV \d+$/ });
    const count = Number((await chip.innerText()).replace(/\D/g, ''));
    await chip.click();
    await expect(page.locator('tbody tr')).toHaveCount(count);

    await page.getByLabel('Alle auswählen').check();
    await page.getByRole('button', { name: `${count} Rückrufe` }).click();
    await expect(page.getByLabel('Worum geht es?')).toHaveValue('Lücke PHV besprechen');
    await page.getByRole('dialog').getByRole('button', { name: 'Anlegen' }).click();
    await expect(page.getByText(`${count} Rückrufe angelegt`)).toBeVisible();
  });
});

test('Assistent beantwortet Kundenfragen', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Assistent' }).click();
  const input = page.getByLabel('Nachricht an den Assistenten');
  await input.fill('Wer hat keine Haftpflicht?');
  await input.press('Enter');
  await expect(page.getByText(/fehlt Privathaftpflicht bei \d+ Kunden/)).toBeVisible();
});

test('Produktkatalog: zusammenführen', async ({ page }) => {
  await page.goto('/production?tab=rates');
  await page.getByRole('button', { name: 'Sach zusammenführen' }).click();
  await page.getByLabel('Zusammenführen in').selectOption({ label: 'PHV · Sach & Haftpflicht' });
  await page.getByRole('dialog').getByRole('button', { name: 'Zusammenführen' }).click();
  await expect(page.getByText('Sach zusammengeführt')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sach zusammenführen' })).toHaveCount(0);
});
