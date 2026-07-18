import { expect, test } from '@playwright/test';

test.describe('bracket connector layouts', () => {
  test('renders representative bracket fixtures consistently', async ({ page }) => {
    await page.goto('/dev/brackets');
    await expect(
      page.getByRole('heading', { name: 'Bracket Component Dev Harness' }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot('bracket-fixtures.png', {
      fullPage: true,
      animations: 'disabled',
    });
  });
});
