<template>
  <div>
    <CredentialManager
      :showPrompt="showCredentialPrompt"
      :bypassMode="bypassMode"
      :error="credentialError"
      :storedCredentialLabels="storedCredentialLabels"
      @submit-keyphrase="handleKeyphraseSubmit"
      @show-bypass-warning="showBypassWarning"
      @confirm-bypass="confirmBypass"
      @cancel-bypass="cancelBypass"
    />
    <Suspense v-if="isMobile">
      <template #default>
        <MobileIDE />
      </template>
      <template #fallback>
        <MobileIDEPlaceholder />
      </template>
    </Suspense>
    <Suspense v-else>
      <template #default>
        <IDE :showingCredentialPrompt="showCredentialPrompt" />
      </template>
      <template #fallback>
        <IDEPlaceholder />
      </template>
    </Suspense>
  </div>
</template>

<script setup lang="ts">
import type { EditorStoreType } from './editorStore'
import type { ConnectionStoreType } from './connectionStore'
import type { ModelConfigStoreType } from './modelStore'
import type { UserSettingsStoreType } from './userSettingsStore'
import type { LLMConnectionStoreType } from './llmStore'
import type { DashboardStoreType } from './dashboardStore'
import type { CommunityApiStoreType } from './communityApiStore'
import type { ChatStoreType } from './chatStore'
import CredentialManager from './CredentialManager.vue'
import QueryExecutionService from './queryExecutionService'
import useScreenNavigation from './useScreenNavigation'
// Import credential manager
import { CredentialManager as CredentialService } from '../data/credentialService'
// Import credential constants or define them here
import {
  CREDENTIAL_PREFIX as credentialPrefix,
  type CredentialType,
} from '../data/credentialHelpers'
import { useAnalyticsStore } from '../stores/analyticsStore.ts'
import QueryResolver from './resolver'
import { provide, computed, ref, defineAsyncComponent, onMounted, onBeforeUnmount } from 'vue'
import type { PropType } from 'vue'
import { Storage } from '../data'

import IDEPlaceholder from '../views/IDEPlaceholder.vue'
import MobileIDEPlaceholder from '../views/MobileIDEPlaceholder.vue'

const IDE = defineAsyncComponent(() => import('../views/IDE.vue'))
const MobileIDE = defineAsyncComponent(() => import('../views/MobileIDE.vue'))

const props = defineProps({
  connectionStore: {
    type: Object as PropType<ConnectionStoreType>,
    required: true,
  },
  editorStore: {
    type: Object as PropType<EditorStoreType>,
    required: true,
  },
  modelStore: {
    type: Object as PropType<ModelConfigStoreType>,
    required: true,
  },
  userSettingsStore: {
    type: Object as PropType<UserSettingsStoreType>,
    required: true,
  },
  llmConnectionStore: {
    type: Object as PropType<LLMConnectionStoreType>,
    required: true,
  },
  dashboardStore: {
    type: Object as PropType<DashboardStoreType>,
    required: true,
  },
  communityApiStore: {
    type: Object as PropType<CommunityApiStoreType>,
    required: true,
  },
  chatStore: {
    type: Object as PropType<ChatStoreType>,
    required: true,
  },
  trilogyResolver: {
    type: QueryResolver,
    required: true,
  },
  storageSources: {
    type: Array as PropType<Storage[]>,
    required: false,
    default: () => [],
  },
})

// UX setup

// Credential state management (upleveled from CredentialManager)
const showCredentialPrompt = ref(false)
const bypassMode = ref(false)
const credentialError = ref('')
const activeKeyphrase = ref<string | null>(null)
const skipKeyPhrase = ref(false)
const storedCredentialLabels = ref<string[]>([])
const pendingCredentialOperations = ref<
  Array<{
    resolve: (value: any) => void
    reject: (reason?: any) => void
    operation: 'save' | 'get'
    params: any
  }>
>([])

// Initialize credential service
const credentialService = new CredentialService({
  credentialPrefix,
  // Other options as needed
})

if (credentialService.getIsCredentialApiSupported()) {
  console.log('Native Credential API supported')
  skipKeyPhrase.value = true
}

// Check for credentials and update stored labels
const checkForCredentials = async (label: string | null = null) => {
  try {
    const credentials = await credentialService.listCredentials()
    storedCredentialLabels.value = credentials.map((cred) => cred.label)
    if (label) {
      // If a specific label is provided, check if it exists
      return storedCredentialLabels.value.includes(label)
    }
    return credentials.length > 0
  } catch (err) {
    console.error('Error checking for credentials:', err)
    storedCredentialLabels.value = []
    return false
  }
}

// Handle keyphrase submission
const handleKeyphraseSubmit = async (keyphrase: string) => {
  if (!keyphrase.trim()) {
    credentialError.value = 'Keyphrase cannot be empty'
    return
  }

  // Verify the keyphrase
  const isValid = await verifyKeyphrase(keyphrase)
  const hasCredentials = storedCredentialLabels.value.length > 0

  if (!isValid && hasCredentials) {
    credentialError.value = 'Invalid keyphrase. Please try again.'
    return
  }

  // Set the active keyphrase and close the prompt
  activeKeyphrase.value = keyphrase
  showCredentialPrompt.value = false
  credentialError.value = ''

  // Complete ALL pending operations
  if (pendingCredentialOperations.value.length > 0) {
    // Process all pending operations
    const operations = [...pendingCredentialOperations.value]
    pendingCredentialOperations.value = [] // Clear the queue

    // Process each operation sequentially to avoid race conditions
    for (const { resolve, operation, params } of operations) {
      try {
        if (operation === 'save') {
          const { label, type, value } = params
          const result = await credentialService.storeCredential(label, type, value, keyphrase)
          resolve(!!result)
        } else if (operation === 'get') {
          const { label, type } = params
          const result = await credentialService.getCredential(label, type, keyphrase)
          resolve(result)
        }
      } catch (error) {
        console.error(`Error in credential operation:`, error)
        resolve(null)
      }
    }

    // Refresh the credential list after all operations
    await checkForCredentials()
  }
}

// Verify keyphrase can decrypt existing credentials
const verifyKeyphrase = async (phrase: string): Promise<boolean> => {
  const credentials = await credentialService.listCredentials()
  if (!credentials || credentials.length < 1) {
    return true
  }

  try {
    const test = credentials[0]
    const result = await credentialService.getCredential(test.label, test.type, phrase)
    return result !== null
  } catch (err) {
    console.error('Error verifying keyphrase:', err)
    return false
  }
}

// Bypass warning handlers
const showBypassWarning = () => {
  bypassMode.value = true
}

// Update confirmBypass to resolve all pending operations with null
const confirmBypass = () => {
  activeKeyphrase.value = null
  showCredentialPrompt.value = false
  bypassMode.value = false

  // Resolve all pending operations with null
  if (pendingCredentialOperations.value.length > 0) {
    const operations = [...pendingCredentialOperations.value]
    pendingCredentialOperations.value = [] // Clear the queue

    for (const operation of operations) {
      operation.resolve(null)
    }
  }
}

const cancelBypass = () => {
  bypassMode.value = false
}

const storeCredentials = async (
  credentials: Array<{ label: string; type: CredentialType; value: string }>,
) => {
  if (!activeKeyphrase.value && !skipKeyPhrase.value) {
    throw new Error('No keyphrase set for storing credentials')
  }

  try {
    const result = await credentialService.storeCredentials(
      credentials,
      activeKeyphrase.value || '',
    )
    await checkForCredentials() // Refresh the list
    return !!result
  } catch (error) {
    console.error('Error saving credentials:', error)
    return false
  }
}

const storeCredential = async (
  label: string,
  type: 'llm' | 'connection',
  value: string,
): Promise<boolean> => {
  // If keyphrase already set, use it directly
  if (activeKeyphrase.value || skipKeyPhrase.value) {
    try {
      const result = await credentialService.storeCredential(
        label,
        type,
        value,
        activeKeyphrase.value,
      )
      await checkForCredentials() // Refresh the list
      return !!result
    } catch (error) {
      console.error('Error saving credential:', error)
      return false
    }
  }

  // Otherwise, show prompt and return a promise
  return new Promise((resolve, reject) => {
    // Add this operation to the array
    pendingCredentialOperations.value.push({
      resolve,
      reject,
      operation: 'save',
      params: { label, type, value },
    })

    // Only show the prompt if it's not already visible
    if (!showCredentialPrompt.value) {
      showCredentialPrompt.value = true
    }
  })
}

const getCredential = async (
  label: string,
  type: 'llm' | 'connection',
): Promise<{ label: string; value: string; type: string } | null> => {
  // If keyphrase already set, use it directly
  if (activeKeyphrase.value || skipKeyPhrase.value) {
    return await credentialService.getCredential(label, type, activeKeyphrase.value || '')
  }

  // Otherwise, show prompt and return a promise
  return new Promise((resolve, reject) => {
    // Add this operation to the array
    pendingCredentialOperations.value.push({
      resolve,
      reject,
      operation: 'get',
      params: { label, type },
    })

    // Only show the prompt if it's not already visible
    if (!showCredentialPrompt.value) {
      showCredentialPrompt.value = true
    }
  })
}

// Check for credentials on initialization
checkForCredentials()

// provide credential methods for use elsewhere in the app
provide('credentialManager', {
  saveCredential: storeCredential,
  getCredential,
  hasKeyphrase: () => activeKeyphrase.value !== null,
  refreshCredentials: checkForCredentials,
})

// Original provides
provide('editorStore', props.editorStore)
provide('connectionStore', props.connectionStore)
provide('modelStore', props.modelStore)
provide('trilogyResolver', props.trilogyResolver)
provide('storageSources', props.storageSources)
provide('userSettingsStore', props.userSettingsStore)
provide('llmConnectionStore', props.llmConnectionStore)
provide('dashboardStore', props.dashboardStore)
provide('communityApiStore', props.communityApiStore)
provide('chatStore', props.chatStore)
const { setActiveScreen, setActiveEditor, setActiveDashboard } = useScreenNavigation()
provide('setActiveScreen', setActiveScreen)
provide('setActiveEditor', setActiveEditor)
provide('setActiveDashboard', setActiveDashboard)

let store = useAnalyticsStore()
provide('analyticsStore', store)
provide(
  'queryExecutionService',
  new QueryExecutionService(props.trilogyResolver, props.connectionStore),
)

const windowWidth = ref(window.innerWidth)
const loaded = ref(false)
const loadingPromises: Promise<any>[] = []

for (let source of props.storageSources) {
  // Add each promise to our array
  loadingPromises.push(
    source.loadEditors().then((editors) => {
      for (let editor of Object.values(editors)) {
        props.editorStore.addEditor(editor)
      }
    }),
  )

  loadingPromises.push(
    (async () => {
      const connections = await source.loadConnections()
      for (let connection of Object.values(connections)) {
        if (connection.getSecret() == 'saved') {
          let cred = await getCredential(connection.getSecretName(), 'connection')
          connection.setSecret(cred ? cred.value : '')
          connection.changed = false // this secret change shouldn't mark the connection as changed
        }
        props.connectionStore.addConnection(connection)
      }
    })(),
  )

  loadingPromises.push(
    source.loadModelConfig().then((models) => {
      for (let modelConfig of Object.values(models)) {
        props.modelStore.addModelConfig(modelConfig)
      }
    }),
  )

  loadingPromises.push(
    (async () => {
      const llmConnections = await source.loadLLMConnections()
      for (let llmConnection of Object.values(llmConnections)) {
        if (llmConnection.getApiKey() == 'saved') {
          let apiKey = await getCredential(llmConnection.getCredentialName(), 'llm')
          llmConnection.setApiKey(apiKey ? apiKey.value : '')
          llmConnection.changed = false // this apiKey change shouldn't mark the connection as changed
        }
        // don't check for defaulting the connection when restoring API keys
        props.llmConnectionStore.addConnection(llmConnection, false)
        if (llmConnection.isDefault) {
          props.llmConnectionStore.activeConnection = llmConnection.name
          props.llmConnectionStore.resetConnection(llmConnection.name)
        }
      }
    })(),
  )
  loadingPromises.push(
    source.loadDashboards().then((dashboards) => {
      for (let dashboard of Object.values(dashboards)) {
        props.dashboardStore.addDashboard(dashboard)
      }
    }),
  )
  loadingPromises.push(
    source.loadChats().then((chats) => {
      for (let chat of Object.values(chats)) {
        props.chatStore.addChat(chat)
      }
    }),
  )
}

// Wait for all promises to resolve, then set loaded to true
Promise.all(loadingPromises)
  .then(() => {
    loaded.value = true
  })
  .catch((error) => {
    console.error('Error loading editor data:', error)
    // You might want to handle the error state appropriately
  })

const saveEditors = async () => {
  for (let source of props.storageSources) {
    await source.saveEditors(
      Object.values(props.editorStore.editors).filter((editor) => editor.storage == source.type),
    )
  }
  console.log('Editors saved')
}
const saveConnections = async () => {
  for (let source of props.storageSources) {
    await source.saveConnections(
      // @ts-ignore
      Object.values(props.connectionStore.connections).filter(
        (connection) => (connection.storage = source.type),
      ),
    )
  }

  // Then save credentials for each connection if they have a secret
  //map this
  const credentialsToSave = await Promise.all(
    Object.values(props.connectionStore.connections).map(async (connection) => {
      if (connection.getSecret() && connection.saveCredential) {
        const secret = connection.getSecret()
        if (secret) {
          return {
            label: connection.getSecretName(),
            type: 'connection' as CredentialType,
            value: secret,
          }
        }
      }
      return null
    }),
  )

  // Filter out null values (connections without secrets)
  const validCredentials = credentialsToSave.filter((credential) => credential !== null) as {
    label: string
    type: CredentialType
    value: string
  }[]

  // Save all credentials at once
  if (validCredentials.length > 0) {
    await storeCredentials(validCredentials)
    console.log('Connections saved')
  }
}
const saveModels = async () => {
  for (let source of props.storageSources) {
    await source.saveModelConfig(
      Object.values(props.modelStore.models).filter((model) => model.storage == source.type),
    )
  }
  console.log('Models saved')
}

// Modified to handle credentials
const saveLLMConnections = async () => {
  console.log('saving llm connections')

  // First save connections to storage
  for (let source of props.storageSources) {
    await source.saveLLMConnections(
      Object.values(props.llmConnectionStore.connections).filter(
        (llmConnection) => llmConnection.storage == source.type,
      ),
    )
  }

  // Then save credentials for each connection if they have apiKey
  const savePromises = Object.values(props.llmConnectionStore.connections).map(
    async (connection) => {
      if (connection.getApiKey()) {
        // Store the API key in the credential manager
        return await storeCredential(connection.getCredentialName(), 'llm', connection.getApiKey())
      }
      return true
    },
  )

  // Wait for all credential save operations to complete
  await Promise.all(savePromises)
}

const saveDashboards = async () => {
  console.log('saving dashboards')
  for (let source of props.storageSources) {
    await source.saveDashboards(
      Object.values(props.dashboardStore.dashboards).filter(
        (dashboard) => dashboard.storage == source.type,
      ),
    )
  }
}

const saveChats = async () => {
  console.log('saving chats')
  for (let source of props.storageSources) {
    await source.saveChats(
      Object.values(props.chatStore.chats).filter((chat) => chat.storage == source.type),
    )
  }
}

const saveAll = async () => {
  await Promise.all([
    saveEditors(),
    saveConnections(),
    saveModels(),
    saveLLMConnections(),
    saveDashboards(),
    saveChats(),
  ])
}

const unSaved = computed(() => {
  return (
    Number(props.editorStore.unsavedEditors || 0) +
    Number(props.connectionStore.unsavedConnections || 0) +
    Number(props.modelStore.unsavedModels || 0) +
    Number(props.llmConnectionStore.unsavedConnections || 0) +
    Number(props.dashboardStore.unsavedDashboards || 0) +
    Number(props.chatStore.unsavedChats || 0)
  )
})

const autoSaveInterval = ref<null | ReturnType<typeof setInterval>>(null)

const startAutoSave = () => {
  // Clear any existing interval
  if (autoSaveInterval.value) {
    clearInterval(autoSaveInterval.value)
  }

  // Set up interval to check and save every 5 minutes (300,000 ms)
  autoSaveInterval.value = setInterval(
    async () => {
      // Only save if there are unsaved changes
      if (unSaved.value > 0) {
        console.log(`Auto-saving ${unSaved.value} unsaved changes...`)
        try {
          await saveAll()
          console.log('Auto-save completed successfully')
        } catch (error) {
          console.error('Auto-save failed:', error)
        }
      }
    },
    1 * 60 * 1000,
  ) // 5 minutes in milliseconds
}

const stopAutoSave = () => {
  if (autoSaveInterval.value) {
    clearInterval(autoSaveInterval.value)
    autoSaveInterval.value = null
  }
}

const handleUnsavedChanges = (event: BeforeUnloadEvent) => {
  if (unSaved.value > 0) {
    event.preventDefault()
    // Modern browsers ignore custom messages and show their own warning
    return ''
  }
}

onMounted(() => {
  startAutoSave()
  window.addEventListener('beforeunload', handleUnsavedChanges)
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  stopAutoSave()
  window.removeEventListener('beforeunload', handleUnsavedChanges)
  window.removeEventListener('resize', handleResize)
})

provide('saveEditors', saveEditors)
provide('saveConnections', saveConnections)
provide('saveModels', saveModels)
provide('saveLLMConnections', saveLLMConnections)
provide('saveDashboards', saveDashboards)
provide('saveChats', saveChats)
provide('saveAll', saveAll)
provide('unSaved', unSaved)

// Initial mobile detection - available immediately on mount
const initialIsMobile = window.innerWidth <= 768

// Coalesced mobile value - uses initial detection until loaded, then switches to responsive
const isMobile = computed(() => {
  if (!loaded.value) {
    return initialIsMobile
  }
  return windowWidth.value <= 768
})

const handleResize = () => {
  windowWidth.value = window.innerWidth
}
provide('isMobile', isMobile)
</script>
