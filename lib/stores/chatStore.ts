import { defineStore } from 'pinia'
import { Chat } from '../chats/chat'
import type { ChatMessage, ChatArtifact, ChatImport } from '../chats/chat'

export const useChatStore = defineStore('chats', {
  state: () => ({
    chats: {} as Record<string, Chat>,
    activeChatId: '',
  }),

  getters: {
    chatList: (state) => Object.values(state.chats).filter((c) => !c.deleted),

    unsavedChats: (state) => Object.values(state.chats).filter((c) => c.changed && !c.deleted).length,

    activeChat: (state) => (state.activeChatId ? state.chats[state.activeChatId] : null),

    getConnectionChats:
      (state) =>
      (llmConnectionName: string): Chat[] =>
        Object.values(state.chats).filter(
          (c) => c.llmConnectionName === llmConnectionName && !c.deleted,
        ),

    getChatById:
      (state) =>
      (chatId: string): Chat | null =>
        state.chats[chatId] || null,
  },

  actions: {
    newChat(llmConnectionName: string, dataConnectionName: string = '', name?: string): Chat {
      const chat = new Chat({
        llmConnectionName,
        dataConnectionName,
        name: name || `Chat ${new Date().toLocaleTimeString()}`,
      })
      this.chats[chat.id] = chat
      this.activeChatId = chat.id
      return chat
    },

    addChat(chat: Chat): void {
      this.chats[chat.id] = chat
    },

    removeChat(id: string): void {
      if (this.chats[id]) {
        this.chats[id].deleted = true
        this.chats[id].changed = true
        if (this.activeChatId === id) {
          this.activeChatId = ''
        }
      }
    },

    setActiveChat(id: string): void {
      if (this.chats[id] && !this.chats[id].deleted) {
        this.activeChatId = id
      }
    },

    clearActiveChat(): void {
      this.activeChatId = ''
    },

    updateChatName(chatId: string, name: string): void {
      if (this.chats[chatId]) {
        this.chats[chatId].setName(name)
      }
    },

    updateChatDataConnection(chatId: string, connectionName: string): void {
      if (this.chats[chatId]) {
        this.chats[chatId].setDataConnection(connectionName)
      }
    },

    addMessageToChat(chatId: string, message: ChatMessage): void {
      if (this.chats[chatId]) {
        this.chats[chatId].addMessage(message)
      }
    },

    addArtifactToChat(chatId: string, artifact: ChatArtifact): number {
      if (this.chats[chatId]) {
        return this.chats[chatId].addArtifact(artifact)
      }
      return -1
    },

    setActiveArtifact(chatId: string, index: number): void {
      if (this.chats[chatId]) {
        this.chats[chatId].setActiveArtifact(index)
      }
    },

    // Import management
    setImports(chatId: string, imports: ChatImport[]): void {
      if (this.chats[chatId]) {
        this.chats[chatId].setImports(imports)
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
    },

    clearChatMessages(chatId: string): void {
      if (this.chats[chatId]) {
        this.chats[chatId].clearMessages()
      }
    },

    loadChats(serializedChats: Record<string, any>): void {
      Object.entries(serializedChats).forEach(([id, data]) => {
        this.chats[id] = Chat.fromSerialized(data)
      })
    },

    serializeChats(): Record<string, any> {
      const serialized: Record<string, any> = {}
      Object.entries(this.chats).forEach(([id, chat]) => {
        if (chat.storage === 'local' && !chat.deleted) {
          serialized[id] = chat.serialize()
        }
      })
      return serialized
    },

    // Mark all chats as saved (used after persistence)
    markAllSaved(): void {
      Object.values(this.chats).forEach((chat) => {
        if (!chat.deleted) {
          chat.changed = false
        }
      })
    },

    // Permanently remove deleted chats from memory
    purgeDeleted(): void {
      Object.keys(this.chats).forEach((id) => {
        if (this.chats[id].deleted) {
          delete this.chats[id]
        }
      })
    },
  },
})

export type ChatStoreType = ReturnType<typeof useChatStore>
export default useChatStore
