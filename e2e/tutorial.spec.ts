import { test, expect } from '@playwright/test'

test('test', async ({ page, isMobile }) => {
  await page.goto('http://localhost:5173/trilogy-studio-core/')
  await page.getByTestId('tutorial-button').click()
  await page.getByTestId('community-model-search').click()
  await page.getByRole('textbox', { name: 'Search by model name...' }).fill('demo-model')
  await page.getByRole('button', { name: 'Import' }).click()
  await page.getByRole('button', { name: 'Submit' }).click()
  await page.getByRole('button', { name: '󱘖' }).click()

  // Make sure the connection is active
  // on non-mobile, the sidebar will also have this testid, so filter to the visible one
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
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('documentation+Studio').click()
  await page.getByTestId('article+Studio+Model Tutorial').click()

  // Step 3: Complete Tutorial Queries - Declaring a constant
  await page.getByTestId('editor').click()
  if (isMobile) {
    await page.getByTestId('editor').click()
    await page.getByTestId('editor').press('ControlOrMeta+a')
  } else {
    await page.getByTestId('editor').click({ clickCount: 4 })
  }
  await page.keyboard.press('Delete')

  const constantQuery = 'const pi <- 3.14; select pi;'
  await page.keyboard.type(constantQuery)
  await page.getByTestId('editor-run-button').click()

  // Wait for query to complete
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Run")')

  // Verify result contains pi = 3.14
  const firstRowCellPi = await page.getByRole('gridcell', { name: '3.14' })
  await expect(firstRowCellPi).toContainText('3.14')
  // await expect(page.getByTestId('results-value-cell')).toContainText('3.14');

  // Step 4: Complete Typing example with states
  await page.getByTestId('next-prompt').click()
  if (isMobile) {
    await page.getByTestId('editor').click()
    await page.getByTestId('editor').press('ControlOrMeta+a')
  } else {
    await page.getByTestId('editor').click({ clickCount: 4 })
  }
  await page.keyboard.press('Delete')

  const typingQuery = `import std.geography; 
auto states <- ['NY', 'CA', 'TX']::list<string::us_state_short>;

select 
    unnest(states) as state, 
    random(state)*100 as rank 
order by 
    state asc;`

  await page.keyboard.type(typingQuery)
  await page.getByTestId('editor-run-button').click()

  // Wait for query to complete
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Cancel")')
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Run")')

  // Verify states are in order CA, NY, TX
  const firstRowCell = await page.getByRole('gridcell', { name: 'CA' })
  await expect(firstRowCell).toContainText('CA')

  // Step 5: Import from lineitem
  await page.getByTestId('next-prompt').click()
  if (isMobile) {
    await page.getByTestId('editor').click()
    await page.getByTestId('editor').press('ControlOrMeta+a')
  } else {
    await page.getByTestId('editor').click({ clickCount: 4 })
  }
  await page.keyboard.press('Delete')

  const lineItemQuery = `import lineitem;
select count(order.id) as order_count;`

  await page.keyboard.type(lineItemQuery)
  await page.getByTestId('editor-run-button').click()

  // Wait for query to complete
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Cancel")')
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Run")')

  // Verify order count equals 15000
  await expect(await page.getByRole('gridcell', { name: '30000' })).toContainText('30000')
  await page.getByTestId('next-prompt').click()
  // Step 6: Create datasource with headquarters
  if (isMobile) {
    await page.getByTestId('editor').click()
    await page.getByTestId('editor').press('ControlOrMeta+a')
  } else {
    await page.getByTestId('editor').click({ clickCount: 4 })
  }
  await page.keyboard.press('Delete')

  const chunks = [
    'import lineitem;\n',
    'property order.customer.nation.region.id.headquarters string;\n',
    'datasource region_headquarters (\n',
    '    region_id: ?order.customer.nation.region.id,\n',
    '    headquarters: order.customer.nation.region.headquarters,)\n',
    'grain (order.customer.nation.region.id)\n',
    "query '''\n",
    "select 1 as region_id, 'HQ1' as headquarters\n",
    'union all\n',
    "select 2 as region_id, 'HQ2' as headquarters\n",
    'union all\n',
    "select 3 as region_id, 'HQ3' as headquarters\n",
    'union all\n',
    "select 4 as region_id, 'HQ4' as headquarters\n",
    "''';\n",
    'select\n',
    '    order.customer.nation.region.headquarters,\n',
    '    total_revenue\n',
    'order by\n',
    '    total_revenue desc;',
  ]

  for (const chunk of chunks) {
    await page.keyboard.type(chunk)
  }

  await page.getByTestId('editor-run-button').click()

  // Wait for query to complete
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Cancel")')
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Run")')

  // Create a new DuckDB connection for iris data
  await page.getByTestId('connection-creator-add-tutorial').click()
  await page.getByTestId('connection-creator-name').click()
  await page.getByTestId('connection-creator-name').fill('iris-data')
  await page.getByTestId('connection-creator-submit').click()

  // Create a new SQL editor with the startup script
  await page.getByTestId('new-sql-editor-iris-data-tutorial').click()

  // Set up the iris table
  let irisTableScript = `CREATE TABLE iris_data AS select *, row_number() over () as pk FROM read_csv('https://raw.githubusercontent.com/mwaskom/seaborn-data/master/iris.csv');`
  if (['safari', 'firefox'].includes(page?.context()?.browser()?.browserType()?.name() || '')) {
    // Safari and Firefox both break on csv import
    return
  }
  if (isMobile) {
    await page.getByTestId('editor').click()
    await page.getByTestId('editor').press('ControlOrMeta+a')
  } else {
    await page.getByTestId('editor').click({ clickCount: 4 })
  }
  await page.keyboard.press('Delete')
  await page.keyboard.type(irisTableScript)

  // Run the script
  await page.getByTestId('editor-run-button').click()
  // go back to editor tab
  if (isMobile) {
    await page.getByTestId('editor-tab').click()
  }
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Run")')

  // Set as startup script
  await page.getByTestId('editor-set-startup-script').click()

  // Go back to the documentation
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('sidebar-icon-tutorial').click()
  // await page.getByTestId('documentation+Studio').click();
  // await page.getByTestId('article+Studio+Model Tutorial').click();

  // Step 8: Create iris model from the connection
  // Navigate to the connection
  if (isMobile) {
    await page.getByTestId('article+Studio+Model Tutorial').click()
  }
  await page.getByTestId('connection-iris-data-tutorial').click()

  // Generate datasource from iris_data table
  await page.getByTestId('database-iris-data-memory-tutorial').click()
  await page.getByTestId('schema-iris-data-main-tutorial').click()
  await page.getByTestId('create-datasource-iris_data').click()
  // accept defaults
  await page.getByTestId('create-datasource-button').click()

  // Modify the generated datasource file
  if (isMobile) {
    await page.getByTestId('editor').click()
    await page.getByTestId('editor').press('ControlOrMeta+a')
  } else {
    await page.getByTestId('editor').click({ clickCount: 4 })
  }

  await page.keyboard.press('Delete')

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
address iris_data;`

  await page.keyboard.type(irisDataSource)
  await page.keyboard.press('Delete')
  await page.keyboard.press('Delete')
  // Set as source
  await page.getByTestId('editor-set-source').click()

  // Rename the file to iris
  await page.getByTestId('edit-editor-name').click()
  await page.getByTestId('editor-name-input').fill('iris')
  await page.keyboard.press('Enter')

  // Step 9: Create a new Trilogy editor and query the iris data
  // this is on left hand nav, not the tutorial embedded one used earlier
  if (isMobile) {
    await page.getByTestId('mobile-menu-toggle').click()
  }
  await page.getByTestId('quick-new-editor-iris-data-trilogy').click()
  if (isMobile) {
    await page.getByTestId('editor').click()
    await page.getByTestId('editor').press('ControlOrMeta+a')
  } else {
    await page.getByTestId('editor').click({ clickCount: 4 })
  }
  await page.keyboard.press('Delete')

  const irisQuery = `import iris;
select
	species,
	avg(petal_length) as avg_petal_length,
	avg(petal_width) as avg_petal_width
;`

  await page.keyboard.type(irisQuery)
  // formatting adds extra parentheses

  await page.getByTestId('editor-run-button').click()
  if (isMobile) {
    await page.getByTestId('editor-tab').click()
  }
  // Wait for query to complete
  await page.waitForSelector('[data-testid="editor-run-button"]:has-text("Run")')
  if (isMobile) {
    await page.getByTestId('results-tab').click()
  }
  // Verify we have results for three iris species
  await expect(await page.getByRole('gridcell', { name: 'versicolor' })).toContainText('versicolor')
})
