const { test, expect } = require('@playwright/test');

test('Quick Order product datalist has suggestions', async ({ page }) => {
  await page.goto('https://axel706.github.io/barstock-app/?v=playwright-qo-suggest-1', {
    waitUntil: 'domcontentloaded'
  });

  await page.waitForSelector('#quickOrderBtn');
  await page.click('#quickOrderBtn');

  const input = page.locator('#quickOrderProductInput');
  await expect(input).toBeVisible();

  await expect(page.locator('#quickOrderProductsList option').first()).toBeAttached({
    timeout: 10000
  });
});
