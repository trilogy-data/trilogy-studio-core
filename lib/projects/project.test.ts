import { describe, it, expect, beforeEach, vi } from 'vitest'
import { reactive } from 'vue'
import { Project } from './project'
import LocalStorage from '../data/localStorage'
import { __resetIdbMemoryForTests } from '../data/idbKv'

vi.mock('../connections', () => ({
  BigQueryOauthConnection: { fromJSON: vi.fn() },
  DuckDBConnection: { fromJSON: vi.fn() },
  MotherDuckConnection: { fromJSON: vi.fn() },
}))

beforeEach(() => {
  const store: Record<string, string> = {}
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v
    },
    removeItem: (k: string) => {
      delete store[k]
    },
    clear: () => {
      Object.keys(store).forEach((k) => delete store[k])
    },
  })
  __resetIdbMemoryForTests()
})

describe('Project.setPromptOverride', () => {
  it('stores a non-empty override and marks the project changed', () => {
    const project = new Project({ name: 'p' })
    project.changed = false
    project.setPromptOverride('overseer', 'custom instructions')
    expect(project.promptOverrides.overseer).toBe('custom instructions')
    expect(project.changed).toBe(true)
  })

  it('trims whitespace before storing', () => {
    const project = new Project({ name: 'p' })
    project.setPromptOverride('architect', '  hi  ')
    expect(project.promptOverrides.architect).toBe('hi')
  })

  it('clears the override on undefined or empty input', () => {
    const project = new Project({
      name: 'p',
      promptOverrides: { analyst: 'old' },
    })
    project.changed = false
    project.setPromptOverride('analyst', undefined)
    expect(project.promptOverrides.analyst).toBeUndefined()
    expect(project.changed).toBe(true)
  })

  it('does not touch the project if value is unchanged', () => {
    const project = new Project({
      name: 'p',
      promptOverrides: { overseer: 'same' },
    })
    project.changed = false
    project.setPromptOverride('overseer', 'same')
    expect(project.changed).toBe(false)
  })

  it('survives a serialize / fromSerialized round-trip', () => {
    const project = new Project({ name: 'p' })
    project.setPromptOverride('overseer', 'custom-overseer-text')
    project.setPromptOverride('architect', 'custom-architect-text')

    const serialized = JSON.parse(JSON.stringify(project.serialize()))
    const restored = Project.fromSerialized(serialized)

    expect(restored.promptOverrides.overseer).toBe('custom-overseer-text')
    expect(restored.promptOverrides.architect).toBe('custom-architect-text')
    expect(restored.promptOverrides.analyst).toBeUndefined()
  })

  it('persists overrides through a Vue reactive proxy', () => {
    // Mirrors how LocalStorage.loadProjects wraps each project in reactive(),
    // and how Pinia exposes project instances via state. Direct mutation on
    // the proxied instance must propagate to the underlying property.
    const project = reactive(new Project({ name: 'p' }))
    project.setPromptOverride('overseer', 'reactive-text')
    expect(project.promptOverrides.overseer).toBe('reactive-text')
  })

  it('round-trips overrides through LocalStorage save/load', async () => {
    const storage = new LocalStorage('test-prompt-overrides:')
    const project = new Project({ id: 'p1', name: 'P1' })
    project.setPromptOverride('overseer', 'overseer-custom')
    project.setPromptOverride('analyst', 'analyst-custom')

    await storage.saveProjects([project])
    const loaded = await storage.loadProjects()

    expect(loaded.p1.promptOverrides.overseer).toBe('overseer-custom')
    expect(loaded.p1.promptOverrides.analyst).toBe('analyst-custom')
    expect(loaded.p1.promptOverrides.architect).toBeUndefined()
  })
})
