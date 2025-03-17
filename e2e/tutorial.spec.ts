import { test, expect } from '@playwright/test';

test('test', async ({ page }) => {
  await page.goto('http://localhost:5173/trilogy-studio-core/');
  await page.getByRole('button', { name: 'Docs and Tutorial' }).click();
  await page.getByRole('textbox', { name: 'Search by model name...' }).click();
  await page.getByRole('textbox', { name: 'Search by model name...' }).fill('demo-model');
  await page.getByRole('button', { name: 'Import' }).click();
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.getByRole('button', { name: '󱘖' }).click();
  await page.locator('#navigation span').filter({ hasText: 'New' }).getByRole('button').click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).click();
  await page.getByRole('textbox', { name: 'Name', exact: true }).fill('my-first-editor');
  await page.getByLabel('Connection').selectOption('demo-model-connection');
  await page.getByRole('button', { name: 'Submit' }).click();
  await page.locator('#navigation div').filter({ hasText: 'import lineitem as lineitem;' }).getByRole('button').click();
  await page.locator('#editor').getByRole('code').locator('div').filter({ hasText: 'SELECT 1 -> echo;' }).nth(4).click();
  await page.getByRole('textbox', { name: 'Editor content' }).press('ControlOrMeta+a');
  await page.getByTestId('editor').click();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A');
  // 3. Delete the selected content
  await page.keyboard.press('Delete');
  // 4. Type or paste new content
  const newContent = `import lineitem as lineitem;
SELECT
    sum(lineitem.extended_price)->sales,
    lineitem.supplier.nation.name,
order by
    sales desc;`;
  await page.keyboard.type(newContent);
  await page.getByTestId('editor-run-button').click();
  await expect(page.getByTestId('model-validator')).toContainText(`Great work: "demo-model" found ✓`);
  await expect(page.getByTestId('editor-validator')).toContainText(`Great work: "my-first-editor" found and connected with right model ✓`);
  await expect(page.getByTestId('results-tab-button')).toContainText(`Results (25)`);
});