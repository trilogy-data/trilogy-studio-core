# LLM Chat Improvements - Phase 2: Import Management & Error Feedback

## Overview
This plan builds on the existing chat implementation to add:
1. **Import Tools**: `add_import` and `remove_import` tools for the LLM
2. **Manual Import UI**: User-facing import selector (modeled after DashboardHeader)
3. **Concept Injection**: Fetch concepts from imports and include in LLM prompt
4. **Error Feedback Loop**: Feed tool failures back to LLM for retry/correction

---

## Current Architecture

### Key Files
- [chatToolExecutor.ts](lib/llm/chatToolExecutor.ts) - Tool execution (`run_trilogy_query`, `chart_trilogy_query`)
- [chatAgentPrompt.ts](lib/llm/chatAgentPrompt.ts) - Tool definitions & system prompt builder
- [LLMChatSplitView.vue](lib/components/llm/LLMChatSplitView.vue) - Chat UI with artifacts panel
- [LLMView.vue](lib/views/LLMView.vue) - Orchestrates chat, tool execution
- [chat.ts](lib/chats/chat.ts) - Chat session data model
- [DashboardHeader.vue](lib/components/dashboard/DashboardHeader.vue) - Import selector pattern reference
- [DashboardImportSelector.vue](lib/components/dashboard/DashboardImportSelector.vue) - Reusable import selector

### Current Flow
1. User sends message → `handleChatMessageWithTools()` in LLMView.vue
2. System prompt built via `buildChatAgentSystemPrompt()` (currently no concepts)
3. LLM responds with tool calls → parsed via `parseToolCalls()`
4. Tools executed via `ChatToolExecutor.executeToolCall()`
5. Results become artifacts in right panel

### Missing Pieces
- No imports field on chat sessions
- No concept information in LLM prompt
- Tool errors logged but not fed back to LLM
- No UI for manual import management

---

## Part 1: Add Imports to Chat Model

### 1.1 Update ChatSessionData Interface
**File**: [chat.ts](lib/chats/chat.ts)

```typescript
// Add to existing interface
export interface ChatImport {
  id: string      // Editor ID
  name: string    // Display name (dot notation: 'folder.editor')
  alias: string   // Optional alias
}

export interface ChatSessionData {
  // ... existing fields ...
  imports: ChatImport[]  // NEW: Track imports for this chat session
}
```

### 1.2 Update Chat Class
**File**: [chat.ts](lib/chats/chat.ts)

Add imports handling:
```typescript
export class Chat implements ChatSessionData {
  imports: ChatImport[]

  constructor(data: Partial<ChatSessionData> = {}) {
    // ... existing ...
    this.imports = data.imports || []
  }

  addImport(imp: ChatImport): boolean {
    if (this.imports.some(i => i.id === imp.id)) return false
    this.imports.push(imp)
    this.markChanged()
    return true
  }

  removeImport(importId: string): boolean {
    const index = this.imports.findIndex(i => i.id === importId)
    if (index === -1) return false
    this.imports.splice(index, 1)
    this.markChanged()
    return true
  }

  // Update serialize/fromSerialized to include imports
}
```

### 1.3 Update Chat Store
**File**: [chatStore.ts](lib/stores/chatStore.ts)

Add actions:
```typescript
actions: {
  // ... existing actions ...

  setImports(chatId: string, imports: ChatImport[]): void {
    if (this.chats[chatId]) {
      this.chats[chatId].imports = imports
      this.chats[chatId].changed = true
    }
  },

  addImportToChat(chatId: string, imp: ChatImport): boolean {
    if (this.chats[chatId]) {
      return this.chats[chatId].addImport(imp)
    }
    return false
  },

  removeImportFromChat(chatId: string, importId: string): boolean {
    if (this.chats[chatId]) {
      return this.chats[chatId].removeImport(importId)
    }
    return false
  }
}
```

---

## Part 2: Import Tools for LLM

### 2.1 Add Tool Definitions
**File**: [chatAgentPrompt.ts](lib/llm/chatAgentPrompt.ts)

Add to `CHAT_TOOLS` array:
```typescript
{
  name: 'add_import',
  description: 'Add a data source import to make its fields/concepts available for queries. Use this when you need fields from a specific data model that is not yet imported.',
  input_schema: {
    type: 'object',
    properties: {
      import_name: {
        type: 'string',
        description: 'The name of the import to add (e.g., "sales.orders" or "finance.revenue")'
      }
    },
    required: ['import_name']
  }
},
{
  name: 'remove_import',
  description: 'Remove a data source import. Use this to clean up unused imports or switch to a different data model.',
  input_schema: {
    type: 'object',
    properties: {
      import_name: {
        type: 'string',
        description: 'The name of the import to remove'
      }
    },
    required: ['import_name']
  }
},
{
  name: 'list_available_imports',
  description: 'List all available data source imports for the current connection. Use this to discover what data models are available.',
  input_schema: {
    type: 'object',
    properties: {},
    required: []
  }
}
```

### 2.2 Update System Prompt Builder
**File**: [chatAgentPrompt.ts](lib/llm/chatAgentPrompt.ts)

Update `ChatAgentPromptOptions` and `buildChatAgentSystemPrompt`:
```typescript
export interface ChatAgentPromptOptions {
  dataConnectionName: string | null
  availableConnections: string[]
  availableConcepts?: ModelConceptInput[]
  maxConceptsToShow?: number
  activeImports?: ChatImport[]           // NEW: Currently imported data sources
  availableImportsForConnection?: ChatImport[]  // NEW: All available imports
}

export function buildChatAgentSystemPrompt(options: ChatAgentPromptOptions): string {
  const {
    dataConnectionName,
    availableConnections,
    availableConcepts,
    maxConceptsToShow = 100,
    activeImports = [],
    availableImportsForConnection = []
  } = options

  // Build imports section
  const importsSection = activeImports.length > 0
    ? `\n\nACTIVE IMPORTS:\n${activeImports.map(i => `- ${i.name}`).join('\n')}`
    : '\n\nNo data sources currently imported. Use add_import to import a data source.'

  const availableImportsSection = availableImportsForConnection.length > 0
    ? `\n\nAVAILABLE DATA SOURCES FOR IMPORT:\n${availableImportsForConnection.map(i => `- ${i.name}`).join('\n')}`
    : ''

  // ... rest of existing prompt building ...

  return `You are a data analysis assistant with access to Trilogy query capabilities.

You have access to tools that can execute queries and generate visualizations. When a user asks about data, analyze their request, write a valid Trilogy query, and use the appropriate tool.

${connectionInfo}
AVAILABLE DATA CONNECTIONS: ${availableConnections.length > 0 ? availableConnections.join(', ') : 'None configured - user needs to set up a data connection first'}
${importsSection}
${availableImportsSection}

TRILOGY SYNTAX RULES:
${rulesInput}

AGGREGATE FUNCTIONS: ${aggFunctions.join(', ')}

COMMON FUNCTIONS: ${functions.slice(0, 35).join(', ')}

VALID DATA TYPES: ${datatypes.join(', ')}
${conceptsSection}

IMPORTANT GUIDELINES:
1. Always use a reasonable LIMIT (e.g., 100-1000) unless the request is specifically for a time series, line chart, or the user asks for all data
2. For charts, let auto-detection choose the chart type unless the user specifies one (e.g., "show me a bar chart", "as a line graph")
3. If a query fails, explain the error clearly and try a corrected version
4. When showing data, prefer tables for detailed exploration and charts for trends/comparisons
5. Use the full field path (e.g., 'order.product.id') - never use FROM clauses
6. Remember: No GROUP BY clause - grouping is implicit by non-aggregated fields in SELECT
7. If you need fields that aren't available, use add_import to import the relevant data source first
`
}
```

### 2.3 Implement Tool Handlers
**File**: [chatToolExecutor.ts](lib/llm/chatToolExecutor.ts)

Update constructor and add new methods:
```typescript
import type { ChatStoreType, ChatImport } from '../stores/chatStore'
import type { EditorStoreType } from '../stores/editorStore'

export class ChatToolExecutor {
  private queryExecutionService: QueryExecutionService
  private connectionStore: ConnectionStoreType
  private chatStore: ChatStoreType | null
  private editorStore: EditorStoreType | null

  constructor(
    queryExecutionService: QueryExecutionService,
    connectionStore: ConnectionStoreType,
    chatStore?: ChatStoreType,
    editorStore?: EditorStoreType
  ) {
    this.queryExecutionService = queryExecutionService
    this.connectionStore = connectionStore
    this.chatStore = chatStore || null
    this.editorStore = editorStore || null
  }

  async executeToolCall(
    toolName: string,
    toolInput: Record<string, any>,
  ): Promise<ToolCallResult> {
    switch (toolName) {
      case 'run_trilogy_query':
        return this.executeTrilogyQuery(/* ... */)
      case 'chart_trilogy_query':
        return this.executeTrilogyQuery(/* ... */)
      case 'add_import':
        return this.addImport(toolInput.import_name)
      case 'remove_import':
        return this.removeImport(toolInput.import_name)
      case 'list_available_imports':
        return this.listAvailableImports()
      default:
        return {
          success: false,
          error: `Unknown tool: ${toolName}. Available tools: run_trilogy_query, chart_trilogy_query, add_import, remove_import, list_available_imports`,
        }
    }
  }

  private addImport(importName: string): ToolCallResult {
    if (!this.chatStore?.activeChatId || !this.editorStore) {
      return { success: false, error: 'No active chat or editor store not available' }
    }

    const chat = this.chatStore.activeChat
    if (!chat?.dataConnectionName) {
      return { success: false, error: 'No data connection selected for this chat' }
    }

    // Find the import in available imports
    const available = this.getAvailableImports(chat.dataConnectionName)
    const importToAdd = available.find(i => i.name === importName || i.name.endsWith(`.${importName}`))

    if (!importToAdd) {
      return {
        success: false,
        error: `Import "${importName}" not found. Available imports: ${available.map(i => i.name).join(', ') || 'none'}`
      }
    }

    // Check if already imported
    if (chat.imports.some(i => i.id === importToAdd.id)) {
      return { success: false, error: `Import "${importName}" is already active` }
    }

    // Add the import
    this.chatStore.addImportToChat(this.chatStore.activeChatId, importToAdd)

    return {
      success: true,
      message: `Successfully added import "${importToAdd.name}". Fields from this data source are now available for queries.`
    }
  }

  private removeImport(importName: string): ToolCallResult {
    if (!this.chatStore?.activeChatId) {
      return { success: false, error: 'No active chat' }
    }

    const chat = this.chatStore.activeChat
    const importToRemove = chat?.imports.find(i => i.name === importName || i.name.endsWith(`.${importName}`))

    if (!importToRemove) {
      return {
        success: false,
        error: `Import "${importName}" is not currently active. Active imports: ${chat?.imports.map(i => i.name).join(', ') || 'none'}`
      }
    }

    this.chatStore.removeImportFromChat(this.chatStore.activeChatId, importToRemove.id)

    return {
      success: true,
      message: `Successfully removed import "${importToRemove.name}".`
    }
  }

  private listAvailableImports(): ToolCallResult {
    const chat = this.chatStore?.activeChat
    if (!chat?.dataConnectionName) {
      return { success: false, error: 'No data connection selected for this chat' }
    }

    const available = this.getAvailableImports(chat.dataConnectionName)
    const active = chat.imports

    return {
      success: true,
      message: `Available imports for connection "${chat.dataConnectionName}":\n${available.map(i => `- ${i.name}${active.some(a => a.id === i.id) ? ' (active)' : ''}`).join('\n') || 'No imports available'}`
    }
  }

  getAvailableImports(connectionName: string): ChatImport[] {
    if (!this.editorStore) return []

    return Object.values(this.editorStore.editors)
      .filter(editor => editor.connection === connectionName)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(editor => ({
        id: editor.id,
        name: editor.name.replace(/\//g, '.'),  // Convert folder/editor to folder.editor
        alias: ''
      }))
  }
}
```

### 2.4 Update ToolCallResult Type
**File**: [chatToolExecutor.ts](lib/llm/chatToolExecutor.ts)

```typescript
export interface ToolCallResult {
  success: boolean
  artifact?: ChatArtifact
  error?: string
  message?: string           // NEW: Success message for non-artifact tools
  executionTime?: number
  query?: string
  generatedSql?: string
}
```

---

## Part 3: Manual Import UI

### 3.1 Add Import Selector to Chat Header
**File**: [LLMChatSplitView.vue](lib/components/llm/LLMChatSplitView.vue)

Add props:
```typescript
props: {
  // ... existing props ...
  availableImports: {
    type: Array as PropType<ChatImport[]>,
    default: () => []
  },
  activeImports: {
    type: Array as PropType<ChatImport[]>,
    default: () => []
  }
}

emits: [
  // ... existing emits ...
  'import-change'
]
```

Update template header-actions slot:
```vue
<template #header-actions>
  <slot name="header-actions">
    <div class="chat-header-controls">
      <!-- Import Selector (like DashboardHeader) -->
      <dashboard-import-selector
        v-if="availableImports.length > 0"
        :available-imports="availableImports"
        :active-imports="activeImports"
        @update:imports="$emit('import-change', $event)"
      />
      <span v-if="connectionInfo" class="connection-info">
        {{ connectionInfo }}
      </span>
    </div>
  </slot>
</template>
```

### 3.2 Wire Up in LLMView.vue
**File**: [LLMView.vue](lib/views/LLMView.vue)

Add computed properties:
```typescript
// Available imports for current data connection
const availableImportsForChat = computed(() => {
  const connectionName = chatStore?.activeChat?.dataConnectionName
  if (!connectionName || !editorStore) return []

  return Object.values(editorStore.editors)
    .filter(editor => editor.connection === connectionName)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(editor => ({
      id: editor.id,
      name: editor.name.replace(/\//g, '.'),
      alias: ''
    }))
})

// Currently active imports for chat
const activeImportsForChat = computed(() => {
  return chatStore?.activeChat?.imports || []
})

// Handle import changes from UI
function handleImportChange(newImports: ChatImport[]) {
  if (chatStore?.activeChatId) {
    chatStore.setImports(chatStore.activeChatId, newImports)
  }
}
```

Update template:
```vue
<l-l-m-chat-split-view
  ref="chatSplitView"
  :title="activeChatTitle"
  :systemPrompt="chatSystemPrompt"
  :connectionInfo="chatConnectionInfo"
  :availableImports="availableImportsForChat"
  :activeImports="activeImportsForChat"
  :initialMessages="activeChatMessages"
  :initialArtifacts="activeChatArtifacts"
  :initialActiveArtifactIndex="activeChatArtifactIndex"
  :externalLoading="isChatLoading"
  :onSendMessage="handleChatMessageWithTools"
  @update:messages="handleMessagesUpdate"
  @update:artifacts="handleArtifactsUpdate"
  @update:activeArtifactIndex="handleActiveArtifactUpdate"
  @import-change="handleImportChange"
/>
```

---

## Part 4: Concept Injection from Imports

### 4.1 Fetch Concepts from Imports
**File**: [LLMView.vue](lib/views/LLMView.vue)

Add concept fetching:
```typescript
import type { ModelConceptInput } from '../llm/data/models'

// Computed: Get concepts from active imports
const chatConcepts = ref<ModelConceptInput[]>([])

// Watch for import changes and fetch concepts
watch(
  () => chatStore?.activeChat?.imports,
  async (imports) => {
    if (!imports?.length || !chatStore?.activeChat?.dataConnectionName) {
      chatConcepts.value = []
      return
    }

    const connectionName = chatStore.activeChat.dataConnectionName

    // Build extraContent from imports (same pattern as dashboard)
    const extraContent = imports.map(imp => ({
      alias: imp.alias || imp.name,
      contents: editorStore?.editors[imp.id]?.contents || ''
    }))

    try {
      // Use validation to get parsed concepts
      const queryInput = {
        text: 'SELECT 1',  // Minimal query just to parse sources
        editorType: 'trilogy' as const,
        imports: [],
        extraContent
      }

      const validation = await queryExecutionService?.validateQuery(
        connectionName,
        queryInput,
        false  // Don't log
      )

      if (validation?.data?.concepts) {
        chatConcepts.value = validation.data.concepts
      }
    } catch (error) {
      console.error('Failed to fetch concepts from imports:', error)
      chatConcepts.value = []
    }
  },
  { deep: true, immediate: true }
)
```

### 4.2 Update System Prompt with Concepts
**File**: [LLMView.vue](lib/views/LLMView.vue)

Update `chatSystemPrompt` computed:
```typescript
const chatSystemPrompt = computed(() => {
  const dataConnectionName = chatStore?.activeChat?.dataConnectionName || null
  const availableConnections = connectionStore
    ? Object.keys(connectionStore.connections)
    : []

  return buildChatAgentSystemPrompt({
    dataConnectionName,
    availableConnections,
    availableConcepts: chatConcepts.value,                    // NEW: Pass concepts
    activeImports: activeImportsForChat.value,                // NEW: Current imports
    availableImportsForConnection: availableImportsForChat.value  // NEW: Available imports
  })
})
```

---

## Part 5: Error Feedback Loop to LLM

### 5.1 Current Problem
In `handleChatMessageWithTools`, errors are logged but not fed back to LLM:
```typescript
if (!result.success) {
  console.error(`Tool ${toolCall.name} failed:`, result.error)
  // Error lost! LLM doesn't know about failure
}
```

### 5.2 Implement Error Feedback
**File**: [LLMView.vue](lib/views/LLMView.vue)

Update `handleChatMessageWithTools`:
```typescript
const handleChatMessageWithTools = async (
  message: string,
  chatMessages: ChatMessage[],
  retryDepth: number = 0,  // Track retry depth
): Promise<{ response?: string; artifacts?: ChatArtifact[] } | void> => {
  const MAX_RETRIES = 2

  if (!llmConnectionStore.activeConnection) {
    return { response: 'No LLM connection available. Please configure an LLM provider first.' }
  }

  isChatLoading.value = true

  try {
    const options: LLMRequestOptions = {
      prompt: message,
      systemPrompt: chatSystemPrompt.value,
      tools: CHAT_TOOLS,
    }

    const response: LLMResponse = await llmConnectionStore.generateCompletion(
      llmConnectionStore.activeConnection,
      options,
      chatMessages,
    )

    const responseText = response.text
    const artifacts: ChatArtifact[] = []
    const toolErrors: string[] = []
    const toolSuccesses: string[] = []

    // Check for tool calls in the response
    const toolCalls = parseToolCalls(responseText)

    if (toolCalls.length > 0 && toolExecutor.value) {
      for (const toolCall of toolCalls) {
        const result = await toolExecutor.value.executeToolCall(toolCall.name, toolCall.input)

        if (result.success) {
          if (result.artifact) {
            artifacts.push(result.artifact)
          }
          if (result.message) {
            toolSuccesses.push(result.message)
          }
        } else {
          toolErrors.push(formatToolResult(toolCall.name, false, { error: result.error }))
        }
      }
    }

    // If there were tool errors and we haven't exceeded retries, feed back to LLM
    if (toolErrors.length > 0 && retryDepth < MAX_RETRIES) {
      const errorFeedback = toolErrors.join('\n')

      // Add assistant response and error feedback to conversation
      const updatedMessages: ChatMessage[] = [
        ...chatMessages,
        { role: 'assistant', content: responseText },
        {
          role: 'user',
          content: `Tool execution failed:\n${errorFeedback}\n\nPlease correct the error and try again.`,
          hidden: true  // Don't show error feedback in UI
        }
      ]

      // Recursive call for retry
      return handleChatMessageWithTools('', updatedMessages, retryDepth + 1)
    }

    // Build final response with any tool success messages
    let finalResponse = responseText
    if (toolSuccesses.length > 0 && !toolCalls.some(tc => tc.name.includes('query'))) {
      // For non-query tools (like import), append success message
      finalResponse += '\n\n' + toolSuccesses.join('\n')
    }

    return {
      response: finalResponse,
      artifacts: artifacts.length > 0 ? artifacts : undefined,
    }
  } catch (err) {
    return {
      response: `Error: ${err instanceof Error ? err.message : 'An unknown error occurred'}`,
    }
  } finally {
    isChatLoading.value = false
  }
}
```

### 5.3 Add Hidden Message Support
**File**: [chat.ts](lib/chats/chat.ts)

The ChatMessage type already supports `hidden` via LLMMessage base type. Ensure UI respects this:

**File**: [LLMChat.vue](lib/components/llm/LLMChat.vue) (if filtering needed)
```typescript
const visibleMessages = computed(() =>
  props.messages.filter(m => !m.hidden)
)
```

---

## Implementation Order

### Phase 1: Model Updates
1. Add `ChatImport` interface to [chat.ts](lib/chats/chat.ts)
2. Add `imports` field to `ChatSessionData`
3. Add import methods to `Chat` class
4. Update `serialize`/`fromSerialized`
5. Add import actions to [chatStore.ts](lib/stores/chatStore.ts)

### Phase 2: Import Tools
1. Add tool definitions to [chatAgentPrompt.ts](lib/llm/chatAgentPrompt.ts)
2. Update `ChatAgentPromptOptions` interface
3. Update `buildChatAgentSystemPrompt` with imports sections
4. Add constructor params to `ChatToolExecutor`
5. Implement `addImport`, `removeImport`, `listAvailableImports` handlers

### Phase 3: Manual Import UI
1. Add props to [LLMChatSplitView.vue](lib/components/llm/LLMChatSplitView.vue)
2. Import `DashboardImportSelector` component
3. Add import selector to header
4. Wire up in [LLMView.vue](lib/views/LLMView.vue)

### Phase 4: Concept Injection
1. Add concept fetching watch in LLMView.vue
2. Update `chatSystemPrompt` to include concepts
3. Test that concepts appear in prompt

### Phase 5: Error Feedback
1. Update `handleChatMessageWithTools` signature
2. Implement error collection and retry logic
3. Add `hidden` message filtering if needed
4. Test error recovery scenarios

---

## Testing Checklist

### Import Tools
- [ ] `add_import` tool adds import to active chat
- [ ] `add_import` fails gracefully if import not found
- [ ] `add_import` prevents duplicate imports
- [ ] `remove_import` tool removes import from chat
- [ ] `remove_import` fails gracefully if import not active
- [ ] `list_available_imports` returns correct list

### Manual UI
- [ ] Import selector appears in chat header
- [ ] Available imports shown for current connection
- [ ] Can add import via UI
- [ ] Can remove import via UI
- [ ] Import changes persist to chat store

### Concepts
- [ ] Concepts fetched when imports added
- [ ] Concepts cleared when imports removed
- [ ] Concepts appear in system prompt
- [ ] LLM can use imported field names in queries

### Error Feedback
- [ ] Failed tool calls trigger retry
- [ ] LLM receives error context
- [ ] LLM can correct and retry successfully
- [ ] Max retries prevents infinite loops
- [ ] Error feedback messages hidden from UI

### Persistence
- [ ] Imports saved with chat session
- [ ] Imports restored when loading chat
- [ ] Changed flag set when imports modified
