import { defineStore } from 'pinia'

// Simple UUID generator that doesn't require external package
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

// Variable for schedule parameters
export interface ScheduleVariable {
  name: string
  value: string
}

// A file selected to be part of a schedule
export interface ScheduledFile {
  id: string
  editorId: string
  editorName: string
  order: number
}

// Backend types for execution
export type OrchestrationBackend = 'github-actions' | 'trilogy-cloud'

// A schedule definition
export interface Schedule {
  id: string
  name: string
  connection: string
  cronExpression: string
  enabled: boolean
  files: ScheduledFile[]
  variables: ScheduleVariable[]
  backend: OrchestrationBackend | null
  // GitHub Actions specific
  githubRepo?: string
  githubBranch?: string
  trilogyJobFolder?: string
  // Metadata
  createdAt: string
  updatedAt: string
  changed: boolean
}

export interface OrchestrationState {
  schedules: Record<string, Schedule>
  activeScheduleId: string
}

const useOrchestrationStore = defineStore('orchestration', {
  state: (): OrchestrationState => ({
    schedules: {},
    activeScheduleId: '',
  }),

  getters: {
    scheduleList: (state) => Object.values(state.schedules),

    activeSchedule: (state) =>
      state.activeScheduleId ? state.schedules[state.activeScheduleId] : null,

    getConnectionSchedules: (state) => (connection: string) =>
      Object.values(state.schedules).filter((schedule) => schedule.connection === connection),

    unsavedSchedules: (state) => {
      return Object.values(state.schedules).filter((schedule) => schedule.changed).length
    },
  },

  actions: {
    createSchedule(name: string, connection: string): Schedule {
      const id = generateUUID()
      const now = new Date().toISOString()

      const schedule: Schedule = {
        id,
        name,
        connection,
        cronExpression: '0 0 * * *', // Default: daily at midnight
        enabled: false,
        files: [],
        variables: [],
        backend: null,
        createdAt: now,
        updatedAt: now,
        changed: true,
      }

      this.schedules[id] = schedule
      return schedule
    },

    updateSchedule(id: string, updates: Partial<Omit<Schedule, 'id' | 'createdAt'>>) {
      if (!this.schedules[id]) {
        throw new Error(`Schedule with ID "${id}" not found.`)
      }

      this.schedules[id] = {
        ...this.schedules[id],
        ...updates,
        updatedAt: new Date().toISOString(),
        changed: true,
      }
    },

    deleteSchedule(id: string) {
      if (!this.schedules[id]) {
        throw new Error(`Schedule with ID "${id}" not found.`)
      }

      delete this.schedules[id]

      if (this.activeScheduleId === id) {
        this.activeScheduleId = ''
      }
    },

    setActiveSchedule(id: string | null) {
      this.activeScheduleId = id || ''
    },

    // File management
    addFileToSchedule(scheduleId: string, editorId: string, editorName: string) {
      const schedule = this.schedules[scheduleId]
      if (!schedule) {
        throw new Error(`Schedule with ID "${scheduleId}" not found.`)
      }

      // Check if file already exists
      if (schedule.files.some((f) => f.editorId === editorId)) {
        return
      }

      const file: ScheduledFile = {
        id: generateUUID(),
        editorId,
        editorName,
        order: schedule.files.length,
      }

      schedule.files.push(file)
      schedule.updatedAt = new Date().toISOString()
      schedule.changed = true
    },

    removeFileFromSchedule(scheduleId: string, fileId: string) {
      const schedule = this.schedules[scheduleId]
      if (!schedule) {
        throw new Error(`Schedule with ID "${scheduleId}" not found.`)
      }

      const index = schedule.files.findIndex((f) => f.id === fileId)
      if (index > -1) {
        schedule.files.splice(index, 1)
        // Re-order remaining files
        schedule.files.forEach((f, i) => {
          f.order = i
        })
        schedule.updatedAt = new Date().toISOString()
        schedule.changed = true
      }
    },

    reorderFiles(scheduleId: string, fileIds: string[]) {
      const schedule = this.schedules[scheduleId]
      if (!schedule) {
        throw new Error(`Schedule with ID "${scheduleId}" not found.`)
      }

      const reorderedFiles: ScheduledFile[] = []
      fileIds.forEach((id, index) => {
        const file = schedule.files.find((f) => f.id === id)
        if (file) {
          file.order = index
          reorderedFiles.push(file)
        }
      })

      schedule.files = reorderedFiles
      schedule.updatedAt = new Date().toISOString()
      schedule.changed = true
    },

    // Variable management
    addVariable(scheduleId: string, name: string, value: string) {
      const schedule = this.schedules[scheduleId]
      if (!schedule) {
        throw new Error(`Schedule with ID "${scheduleId}" not found.`)
      }

      // Check if variable with same name exists
      const existing = schedule.variables.find((v) => v.name === name)
      if (existing) {
        existing.value = value
      } else {
        schedule.variables.push({ name, value })
      }

      schedule.updatedAt = new Date().toISOString()
      schedule.changed = true
    },

    removeVariable(scheduleId: string, name: string) {
      const schedule = this.schedules[scheduleId]
      if (!schedule) {
        throw new Error(`Schedule with ID "${scheduleId}" not found.`)
      }

      const index = schedule.variables.findIndex((v) => v.name === name)
      if (index > -1) {
        schedule.variables.splice(index, 1)
        schedule.updatedAt = new Date().toISOString()
        schedule.changed = true
      }
    },

    updateVariable(scheduleId: string, name: string, newName: string, newValue: string) {
      const schedule = this.schedules[scheduleId]
      if (!schedule) {
        throw new Error(`Schedule with ID "${scheduleId}" not found.`)
      }

      const variable = schedule.variables.find((v) => v.name === name)
      if (variable) {
        variable.name = newName
        variable.value = newValue
        schedule.updatedAt = new Date().toISOString()
        schedule.changed = true
      }
    },

    // Mark schedule as saved
    markScheduleSaved(id: string) {
      if (this.schedules[id]) {
        this.schedules[id].changed = false
      }
    },

    // Load schedules from storage
    loadSchedules(schedules: Record<string, Schedule>) {
      this.schedules = schedules
    },

    // Export schedule for serialization
    exportSchedule(id: string): Schedule | null {
      return this.schedules[id] || null
    },

    // Export all schedules
    exportAllSchedules(): Record<string, Schedule> {
      return { ...this.schedules }
    },
  },
})

export default useOrchestrationStore
export type OrchestrationStoreType = ReturnType<typeof useOrchestrationStore>
