import { test, expect } from './console-capture'
import type { Page } from '@playwright/test'
import {
  deleteEditor,
  localConnectionId,
  openSidebarScreen,
  prepareTestPage,
  refreshConnection,
  waitForConnectionReady,
} from './test-helpers.js'

const CONNECTION_NAME = 'prune-test'
const CONNECTION_ID = localConnectionId(CONNECTION_NAME)
const EDITORS = ['prune-one', 'prune-two', 'prune-three']

const editorRowId = (name: string) => `editor-e-local-${CONNECTION_ID}-${name}`

test.beforeEach(async ({ page }) => {
  await prepareTestPage(page)
})

async function gotoStudio(page: Page) {
  await page.goto('#skipTips=true')
  await expect(page.getByTestId('sidebar-icons')).toBeVisible({ timeout: 30000 })
}

async function createDuckdbConnection(page: Page) {
  await openSidebarScreen(page, 'connections')
  await page.getByTestId('connection-creator-add').click()
  await page.getByTestId('connection-creator-name').fill(CONNECTION_NAME)
  await page.getByTestId('connection-creator-submit').click()
  await refreshConnection(page, CONNECTION_NAME)
  await waitForConnectionReady(page, CONNECTION_NAME)
}

async function createEditor(page: Page, name: string) {
  await page.getByTestId('editor-creator-add').click()
  await page.getByTestId('editor-creator-name').fill(name)
  await page.getByTestId('editor-creator-type').selectOption('sql')
  await page
    .getByTestId('editor-creator-connection-select')
    .selectOption({ label: CONNECTION_NAME })
  await page.getByTestId('editor-creator-submit').click()
  await expect(page.getByTestId(editorRowId(name))).toBeVisible()
}

/**
 * The editors list is `v-show`n on `activeSidebarScreen`, so anything that
 * knocks that value off 'editors' empties the whole sidebar column rather than
 * throwing — the list is simply gone, with the icon rail still sitting there.
 * Assert on a row plus the header action so both the tree and its chrome are
 * covered.
 */
async function expectEditorsSidebar(page: Page) {
  await expect(page.getByTestId('editor-creator-add')).toBeVisible()
  await expect(page.getByTestId('editor-s-local')).toBeVisible()
}

// Mobile navigates the same tree by drilling into it, so the "list disappeared"
// state this covers does not exist there.
test.describe('editor sidebar survives editor mutations', () => {
  test.skip(({ isMobile }) => !!isMobile, 'desktop sidebar column only')

  test('pruning open editors leaves the editors list on screen', async ({ page }) => {
    test.setTimeout(180000)
    await gotoStudio(page)
    await createDuckdbConnection(page)
    await openSidebarScreen(page, 'editors')

    for (const name of EDITORS) {
      await createEditor(page, name)
    }

    // Open each one first: pruning editors that own a tab is the case that
    // moves the active tab around, and it is the state an agent editing files
    // for you leaves the app in.
    for (const name of EDITORS) {
      await page.getByTestId(editorRowId(name)).click()
      await expect(page.getByTestId(`tab-${name}`)).toBeVisible()
    }

    for (const name of EDITORS) {
      await deleteEditor(page, editorRowId(name))
      await expect(page.getByTestId(editorRowId(name))).toHaveCount(0)
      await expectEditorsSidebar(page)
    }

    // Deleting from the sidebar leaves the tabs behind. Closing them is the
    // other half of a prune — and it is what the chat's `delete_editor` tool
    // does on your behalf, one tab per deleted editor.
    for (const name of EDITORS) {
      await page.getByTestId(`tab-${name}`).locator('.tab-close-btn').click()
      await expect(page.getByTestId(`tab-${name}`)).toHaveCount(0)
      await expectEditorsSidebar(page)
    }
  })
})
