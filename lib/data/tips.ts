export interface ModalItem {
  id: string
  title: string
  content: string
  category: 'onboarding' | 'editor' | 'dashboard' | 'community' | 'announcement'
  highlightDataTestId?: string
}

export const tips: ModalItem[] = [
  {
    id: 'welcome',
    title: 'Welcome!',
    content:
      "Welcome to Trilogy Studio, an analytics IDE! Let's get you started with the basics. If you know what you're doing, feel free to dismiss these tips.",
    category: 'onboarding',
  },
  {
    id: 'navigation',
    title: 'Navigation',
    content:
      'Access different sections through the sidebar on the left. The right side contains a tabbed browser with your primary workspaces. Opening new items will open new tabs.',
    category: 'onboarding',
    highlightDataTestId: 'sidebar-icons',
  },
  {
    id: 'settings',
    title: 'Settings',
    content:
      'User settings - such as darkmode - can be accessed through the gear on the bottom of the sidebar.',
    category: 'onboarding',
    highlightDataTestId: 'sidebar-icon-settings',
  },
  {
    id: 'trilogy',
    title: 'Trilogy - The Query Language',
    content:
      'The studio supports standard SQL, but most rich functionality expects you to write Trilogy, a modified SQL syntax that streamlines analytics. The tutorial in the help section is the best way to get up to speed with it!',
    category: 'onboarding',
    highlightDataTestId: 'sidebar-icon-tutorial',
  },
]

export const editorTips: ModalItem[] = [
  {
    id: 'editor-intro',
    title: 'Settings',
    content:
      'Editors let you run SQL or Trilogy commands. Click the run button in top right to run a query.',
    category: 'editor',
    highlightDataTestId: 'editor-run-button',
  },
  {
    id: 'editor-shortcuts',
    title: 'Keyboard Shortcuts',
    content:
      'Standard keyboard shortcuts are available to run, validate, generate AI code, format, and save your work.',
    category: 'editor',
    highlightDataTestId: 'editor-shortcut-hints',
  },
  {
    id: 'editor-validate',
    title: 'Validate',
    content:
      'Click the validate button to parse the current Trilogy script. This will provide syntax feedback and populate the schema explorer on the right.',
    category: 'editor',
    highlightDataTestId: 'editor-validate-button',
  },
  {
    id: 'editor-save',
    title: 'Save',
    content:
      'Click the save button to save your changes to local browser storage. Trilogy will auto-save regularly, but you can trigger on demand.',
    category: 'editor',
    highlightDataTestId: 'editor-save-button',
  },
  {
    id: 'editor-sources',
    title: 'Sources',
    content:
      'An editor can be marked as a "source". Sources are special editors that can be imported by other editors using import syntax `import <editor_name> as <alias>. Use this to create reusable abstractions and models.',
    category: 'editor',
    highlightDataTestId: 'editor-set-source',
  },
  {
    id: 'editor-ai',
    title: 'AI Assistance',
    content:
      'If you have configured an LLM connection, you can interact with the AI assistant via a chat window. The assistant can help you generate or update code, but will not have direct access to your db.',
    category: 'editor',
    highlightDataTestId: 'editor-generate-button',
  },
]

export const dashboardTips: ModalItem[] = [
  {
    id: 'dashboard-intro',
    title: 'Dashboard',
    content:
      'Welcome to a dashboard - a way of interactively exploring visualized data and markup. It natively support cross-filtering, drilldown, global filtering, and other interactivity. Click or drag on charts to filter. They are designed to be lightweight, customizable, and interactive. You can close these tips in the top right if you know what you\'re doing!',
    category: 'dashboard',
  },
  {
    id: 'dashboard-full-screen',
    title: 'Full Screen',
    content:
      'Dashboards can be full-screen for viewing and analysis or in edit mode, which will allow you to modify the layout and content. Use the button in the top right to toggle between modes.',
    category: 'dashboard',
    highlightDataTestId: 'toggle-edit-mode-button',
  },
  {
    id: 'dashboard-add-item',
    title: 'Add Dashboard Item',
    content:
      'Use the add item button in the top left to add new charts, tables, markdown blocks, or filters to your dashboard. You will need to be in edit mode to see it.',
    category: 'dashboard',
    highlightDataTestId: 'add-item-button',
  },
  {
    id: 'dashboard-edit',
    title: 'Dashboard Data',
    content:
      'Dashboarding is Trilogy-SQL centric. To populate an item, you need to give it a data query. Click the edit button on the item header to configure data and appearance. (the header is available when you mouse over a widget in edit mode.) ',
    category: 'dashboard',
    highlightDataTestId: 'dashboard-item-header-controls',
  },
  {
    id: 'dashboard-filter',
    title: 'Dashboard Filters',
    content:
      'The omni-filter bar at the top of dashboards can be used to filter all items. You can also add filter widgets, which are just queries that render as a search box and cross-filter content.',
    category: 'dashboard',
    highlightDataTestId: 'filter-input',
  },
  {
    id: 'dashboard-source',
    title: 'Dashboard Source',
    content:
      'Dashboards run queries against a source editor. Add any new common fields or calculations to the source so they can be used throughout the dashboard. If you define a calculation locally to a widget, it will not be usable for cross-filtering across widgets.',
    category: 'dashboard',
    highlightDataTestId: 'dashboard-import-wrapper',
  },
  {
    id: 'dashboard-connection',
    title: 'Dashboard Connection',
    content:
      'Dashboards run queries against a source editor, which in turn runs against a database connection. You can change the connection for the source editor using the connection selector in the top right.',
    category: 'dashboard',
    highlightDataTestId: 'connection-selector-wrapper',
  },
  {
    id: 'dashboard-features',
    title: 'Complex Types',
    content:
      'A basic dashboard is just charts and tables, but you can use Markdown blocks and filters to make more rich, interactive experiences. Markdown blocks can have source trilogy queries and have a special syntax for embedding results in line.',
    category: 'dashboard',
  },
]

export const communityTips: ModalItem[] = [
  {
    id: 'model-intro',
    title: 'Community Models',
    content:
      'Packages of data and metadata can be shared as community models. You can use this page to browse and import models. Models are open-source and community contributed.',
    category: 'community',
    highlightDataTestId: 'sidebar-icon-community-models',
  },
  {
    id: 'feature-update',
    title: 'Sharing Dashboards!',
    content:
      'Dashboard share links are a special URL that lets you share dashboards with others. It will automatically import the relevant model to support the dashboard. This will only work with public models though; not any that you have defined locally.',
    category: 'community',
    highlightDataTestId: 'copy-dashboard-share-button',
  },
]
