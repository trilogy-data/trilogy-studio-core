import { describe, it, expect } from 'vitest'
import { createMobileSidebarNavigation } from './useMobileSidebarNavigation'

describe('useMobileSidebarNavigation', () => {
  it('starts at the root menu with no title', () => {
    const nav = createMobileSidebarNavigation()
    expect(nav.level.value).toBe('root')
    expect(nav.title.value).toBe('')
    expect(nav.canGoBack.value).toBe(false)
  })

  it('shows the destination title until a tree level is pushed', () => {
    const nav = createMobileSidebarNavigation()
    nav.enterDestination('Query')
    expect(nav.level.value).toBe('detail')
    expect(nav.title.value).toBe('Query')

    nav.push({ title: 'prod', onBack: () => {} })
    expect(nav.title.value).toBe('prod')
    expect(nav.depth.value).toBe(1)
  })

  it('back pops one level at a time, then leaves the destination', () => {
    const nav = createMobileSidebarNavigation()
    const restored: string[] = []
    nav.enterDestination('Query')
    nav.push({ title: 'prod', onBack: () => restored.push('prod') })
    nav.push({ title: 'reports', onBack: () => restored.push('reports') })

    nav.back()
    expect(restored).toEqual(['reports'])
    expect(nav.title.value).toBe('prod')

    nav.back()
    expect(restored).toEqual(['reports', 'prod'])
    expect(nav.title.value).toBe('Query')
    expect(nav.level.value).toBe('detail')

    nav.back()
    expect(nav.level.value).toBe('root')
  })

  it('home unwinds every pushed level in reverse so trees reset to their root', () => {
    const nav = createMobileSidebarNavigation()
    const restored: string[] = []
    nav.enterDestination('Connect')
    nav.push({ title: 'warehouse', onBack: () => restored.push('warehouse') })
    nav.push({ title: 'public', onBack: () => restored.push('public') })

    nav.home()

    expect(restored).toEqual(['public', 'warehouse'])
    expect(nav.level.value).toBe('root')
    expect(nav.depth.value).toBe(0)
  })

  it('unwinds the previous destination when switching destinations', () => {
    const nav = createMobileSidebarNavigation()
    const restored: string[] = []
    nav.enterDestination('Query')
    nav.push({ title: 'prod', onBack: () => restored.push('prod') })

    nav.enterDestination('Chart')

    expect(restored).toEqual(['prod'])
    expect(nav.depth.value).toBe(0)
    expect(nav.title.value).toBe('Chart')
  })

  it('falls back to the destination title while search is filtering the list', () => {
    const nav = createMobileSidebarNavigation()
    nav.enterDestination('Query')
    nav.push({ title: 'reports', onBack: () => {} })
    expect(nav.title.value).toBe('reports')

    // Search results are flat matches, not children of the drilled-into node,
    // so labelling the screen with that node would be misleading.
    nav.searchActive.value = true
    expect(nav.title.value).toBe('Query')

    nav.searchActive.value = false
    expect(nav.title.value).toBe('reports')
  })
})
