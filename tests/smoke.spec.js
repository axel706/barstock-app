const { test, expect } = require('@playwright/test');

test('BarStock app loads without console errors', async ({ page }) => {
  const errors = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  await page.goto('https://axel706.github.io/barstock-app/?v=playwright-smoke-1', {
    waitUntil: 'domcontentloaded'
  });

  await expect(page.locator('#authOverlay')).toBeVisible();

  expect(errors).toEqual([]);
});
