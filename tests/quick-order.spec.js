const { test, expect } = require('@playwright/test');

test('Quick Order modal opens', async ({ page }) => {
  await page.goto('https://axel706.github.io/barstock-app/?v=playwright-qo-1', {
    waitUntil: 'domcontentloaded'
  });

  // Esperar a que la app cargue
  await page.waitForSelector('#quickOrderBtn', { timeout: 10000 });

  // Click en Quick Order
  await page.click('#quickOrderBtn');

  // Verificar que el modal aparece
  const modal = page.locator('#quickOrderModalBg');
  await expect(modal).toBeVisible();
});
