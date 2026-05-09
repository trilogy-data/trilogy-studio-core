import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useProjectStore } from './projectStore'

describe('projectStore.setProjectPromptOverride', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('writes the override onto the active project and marks it changed', () => {
    const store = useProjectStore()
    const project = store.newProject('Test')
    project.changed = false

    store.setProjectPromptOverride(project.id, 'overseer', 'CUSTOM TEXT')

    expect(store.projects[project.id].promptOverrides.overseer).toBe('CUSTOM TEXT')
    expect(store.projects[project.id].changed).toBe(true)
  })

  it('clears the override when passed undefined', () => {
    const store = useProjectStore()
    const project = store.newProject('Test')
    store.setProjectPromptOverride(project.id, 'architect', 'one')
    project.changed = false

    store.setProjectPromptOverride(project.id, 'architect', undefined)

    expect(store.projects[project.id].promptOverrides.architect).toBeUndefined()
    expect(store.projects[project.id].changed).toBe(true)
  })

  it('survives reads through activeProject computed-style access', () => {
    const store = useProjectStore()
    const project = store.newProject('Test')
    store.setProjectPromptOverride(project.id, 'analyst', 'analyst-instructions')

    // Mirrors what PromptManager reads via `projectStore.activeProject`.
    expect(store.activeProject?.promptOverrides.analyst).toBe('analyst-instructions')
  })
})
