import { test, expect } from '@playwright/test'

test('test', async ({ page }) => {
  await page.goto('http://localhost:5173/trilogy-studio-core/')
  await page.getByRole('button', { name: 'Docs and Tutorial' }).click()
  await page.getByRole('textbox', { name: 'Search by model name...' }).click()
  await page.getByRole('textbox', { name: 'Search by model name...' }).fill('demo-model')
  await page.getByRole('button', { name: 'Import' }).click()
  await page.getByRole('button', { name: 'Submit' }).click()
  await page.getByRole('button', { name: '󱘖' }).click()

  // Make sure the connection is active
  // on non-mobile, the sidebar will also have this, so filter tot he visible one
  await page
    .getByTestId('refresh-connection-demo-model-connection')
    .filter({ visible: true })
    .click()
  await page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="status-icon-demo-model-connection"]')
    if (!element) return false

    const style = window.getComputedStyle(element)
    const backgroundColor = style.backgroundColor
    console.log(backgroundColor)

    // Check if the background color is green (in RGB format)
    return backgroundColor === 'rgb(0, 128, 0)' || backgroundColor === '#008000'
  })

  //
  await page.getByTestId('editor-creator-add-tutorial').click()
  await page.getByTestId('editor-creator-name-tutorial').click()
  await page.getByTestId('editor-creator-name-tutorial').fill('my-first-editor')
  await page
    .getByTestId('editor-creator-connection-select-tutorial')
    .selectOption('demo-model-connection')
  await page.getByTestId('editor-creator-submit-tutorial').click()
  await expect(page.getByTestId('model-validator')).toContainText(
    `Great work: "demo-model" found ✓`,
  )
  await expect(page.getByTestId('demo-connection-validator')).toContainText(
    `Great work: "demo-model-connection" found and connected with right model ✓`,
  )
  await expect(page.getByTestId('editor-validator')).toContainText(
    `Great work: "my-first-editor" found and connected with right model ✓`,
  )
  await page.getByTestId('editor').click()
  await page.waitForTimeout(500)
  // console.log(process.platform ==='darwin' ? 'Meta+A' : 'Control+A')
  // await page.keyboard.press('ControlOrMeta+a');
  await page.getByTestId('editor').click({ clickCount: 3 })
  // await page.keyboard.press('Control+A')
  // 3. Delete the selected content
  await page.keyboard.press('Delete')
  // 4. Type or paste new content
  const newContent = `import lineitem as lineitem;
SELECT
    sum(lineitem.extended_price)->sales,
    lineitem.supplier.nation.name,
order by
    sales desc;`
  await page.keyboard.type(newContent)
  await page.getByTestId('editor-run-button').click()
  // Wait for text to change to "Cancel", indicating query execution started.
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Cancel")')
  // Wait for text to change back to "Run", indicating query execution finished.
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Run")')

  await expect(page.getByTestId('results-tab-button')).toContainText(`Results (25)`)

  // MODEL TUTORIAL
  
  // Step 1: Open the Docs and Tutorial
  await page.getByTestId('documentation+Studio').click();
  await page.getByTestId('article+Studio+Model Tutorial').click();

  
  // Step 3: Complete Tutorial Queries - Declaring a constant
  await page.getByTestId('editor').click();
  await page.getByTestId('editor').click({ clickCount: 3 });
  await page.keyboard.press('Delete');
  
  const constantQuery = 'const pi <- 3.14; select pi;';
  await page.keyboard.type(constantQuery);
  await page.getByTestId('editor-run-button').click();
  
  // Wait for query to complete
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Cancel")');
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Run")');
  
  // Verify result contains pi = 3.14
  await expect(page.getByTestId('results-value-cell')).toContainText('3.14');
  
  // Step 4: Complete Typing example with states
  await page.getByTestId('editor').click({ clickCount: 3 });
  await page.keyboard.press('Delete');
  
  const typingQuery = `import std.geography; 
auto states <- ['NY', 'CA', 'TX']::list<string::us_state_short>;

select 
    unnest(states) as state, 
    random(state)*100 as rank 
order by 
    state asc;`;
    
  await page.keyboard.type(typingQuery);
  await page.getByTestId('editor-run-button').click();
  
  // Wait for query to complete
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Cancel")');
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Run")');
  
  // Verify states are in order CA, NY, TX
  const firstRowCell = page.getByTestId('results-table').locator('tbody tr').nth(0).locator('td').first();
  await expect(firstRowCell).toContainText('CA');
  
  // Step 5: Import from lineitem
  await page.getByTestId('editor').click({ clickCount: 3 });
  await page.keyboard.press('Delete');
  
  const lineItemQuery = `import lineitem;
select count(order.id) as order_count;`;
  
  await page.keyboard.type(lineItemQuery);
  await page.getByTestId('editor-run-button').click();
  
  // Wait for query to complete
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Cancel")');
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Run")');
  
  // Verify order count equals 15000
  await expect(page.getByTestId('results-value-cell')).toContainText('15000');
  
  // Step 6: Create datasource with headquarters
  await page.getByTestId('editor').click({ clickCount: 3 });
  await page.keyboard.press('Delete');
  
  const datasourceQuery = `import lineitem;

property order.customer.nation.region.id.headquarters string;

datasource region_headquarters (
    region_id: ?order.customer.nation.region.id,
    headquarters: order.customer.nation.region.headquarters,)
grain (order.customer.nation.region.id)
query '''
select 1 as region_id, 'HQ1' as headquarters
union all
select 2 as region_id, 'HQ2' as headquarters
union all
select 3 as region_id, 'HQ3' as headquarters
union all
select 4 as region_id, 'HQ4' as headquarters
''';

select 
    order.customer.nation.region.headquarters,
    sum(extended_price * (1 - discount)) as total_revenue
order by total_revenue desc;`;
  
  await page.keyboard.type(datasourceQuery);
  await page.getByTestId('editor-run-button').click();
  
  // Wait for query to complete
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Cancel")');
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Run")');
  
  // Verify HQ4 is in the results with expected revenue
  const resultsTable = page.getByTestId('results-table');
  await expect(resultsTable).toContainText('HQ4');
  
  // Step 7: Create iris database connection
  // Go back to the documentation
  await page.getByRole('button', { name: 'Docs and Tutorial' }).click();
  await page.getByRole('link', { name: 'Model Tutorial' }).click();
  
  // Create a new DuckDB connection for iris data
  await page.getByTestId('add-connection-button').click();
  await page.getByLabel('Connection Name').fill('iris-data');
  await page.getByLabel('Connection Type').selectOption('duckdb');
  await page.getByRole('button', { name: 'Create Connection' }).click();
  
  // Create a new SQL editor with the startup script
  await page.getByTestId('create-sql-editor-button').click();
  
  // Set up the iris table
  const irisTableScript = `CREATE TABLE iris_data AS select *, row_number() over () as pk FROM read_csv('https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv');`;
  await page.getByTestId('sql-editor').click({ clickCount: 3 });
  await page.keyboard.press('Delete');
  await page.keyboard.type(irisTableScript);
  
  // Run the script
  await page.getByTestId('sql-editor-run-button').click();
  await page.waitForSelector('[data-testid="sql-editor-run-button"]:has-text("Run")');
  
  // Set as startup script
  await page.getByRole('button', { name: 'Set editor as startup script' }).click();
  
  // Go back to the documentation
  await page.getByRole('button', { name: 'Docs and Tutorial' }).click();
  await page.getByRole('link', { name: 'Model Tutorial' }).click();
  
  // Step 8: Create iris model from the connection
  // Navigate to the connection
  await page.getByTestId('connection-iris-data').click();
  await page.getByTestId('refresh-connection-iris-data').click();
  
  // Generate datasource from iris_data table
  await page.getByTestId('table-iris_data').click();
  await page.getByTestId('create-datasource-iris_data').click();
  
  // Modify the generated datasource file
  await page.getByTestId('editor').click({ clickCount: 3 });
  await page.keyboard.press('Delete');
  
  const irisDataSource = `key pk int; # surrogate primary key for the dataset
property pk.sepal_length float;
property pk.sepal_width float;
property pk.petal_length float;
property pk.petal_width float;
property pk.species string;

datasource iris_data (
	sepal_length:sepal_length,
	sepal_width:sepal_width,
	petal_length:petal_length,
	petal_width:petal_width,
	species:species,
	pk:pk,
)
grain (pk)
address iris_data;`;
  
  await page.keyboard.type(irisDataSource);
  
  // Set as source
  await page.getByRole('button', { name: 'Set as source' }).click();
  
  // Rename the file to iris
  await page.getByTestId('editor-name-input').click();
  await page.getByTestId('editor-name-input').fill('iris');
  await page.keyboard.press('Enter');
  
  // Step 9: Create a new Trilogy editor and query the iris data
  await page.getByTestId('create-trilogy-editor-button').click();
  await page.getByTestId('editor').click({ clickCount: 3 });
  await page.keyboard.press('Delete');
  
  const irisQuery = `import iris;
select
	species,
	avg(petal_length) as avg_petal_length,
	avg(petal_width) as avg_petal_width
;`;
  
  await page.keyboard.type(irisQuery);
  await page.getByTestId('editor-run-button').click();
  
  // Wait for query to complete
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Cancel")');
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Run")');
  
  // Verify we have results for three iris species
  const resultsCount = await page.getByTestId('results-table').locator('tbody tr').count();
  expect(resultsCount).toBe(3);
  
  // Verify species names appear in results
  await expect(page.getByTestId('results-table')).toContainText('setosa');
  await expect(page.getByTestId('results-table')).toContainText('versicolor');
  await expect(page.getByTestId('results-table')).toContainText('virginica');
});