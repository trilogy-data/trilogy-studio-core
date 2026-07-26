import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MobileSidebarLayout from './MobileSidebarLayout.vue'
import TabDropdownItem from './TabDropdownItem.vue'
import type { Tab } from '../../stores/useScreenNavigation'

const tabs: Tab[] = [
  { id: 'tab-1', title: 'Orders', screen: 'editors', address: 'orders' },
  { id: 'tab-2', title: 'Lineitem', screen: 'editors', address: 'lineitem' },
  { id: 'tab-3', title: 'Sales', screen: 'dashboard', address: 'sales' },
]

function mountLayout(props: Record<string, unknown> = {}) {
  return mount(MobileSidebarLayout, {
    props: { menuOpen: false, activeScreen: 'editors', tabs, activeTab: 'tab-1', ...props },
  })
}

async function openDropdown(wrapper: ReturnType<typeof mountLayout>) {
  await wrapper.find('.tab-dropdown-container').trigger('click')
}

describe('MobileSidebarLayout tab switcher', () => {
  // The parent feeds these straight into closeTab(tabId) / closeOtherTabsExcept(tabId).
  // Emitting a Tab instead made closing a no-op and turned "close others" into
  // "close everything", so the payload shape is the contract worth pinning.
  it('forwards a closed tab as its id', async () => {
    const wrapper = mountLayout()
    await openDropdown(wrapper)

    wrapper.findAllComponents(TabDropdownItem)[1].vm.$emit('close', 'tab-2')
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('tab-closed')).toEqual([['tab-2']])
  })

  it('closes other tabs against the active tab id', async () => {
    const wrapper = mountLayout()
    await openDropdown(wrapper)
    await wrapper.find('.close-others-btn').trigger('click')
    await wrapper.find('.confirm-btn').trigger('click')

    expect(wrapper.emitted('close-other-tabs')).toEqual([['tab-1']])
  })

  it('refuses to close others when there is no active tab to keep', async () => {
    const wrapper = mountLayout({ activeTab: null })
    await openDropdown(wrapper)
    await wrapper.find('.close-others-btn').trigger('click')
    await wrapper.find('.confirm-btn').trigger('click')

    // A null id matches nothing, so the store would have filtered every tab away.
    expect(wrapper.emitted('close-other-tabs')).toBeUndefined()
  })

  it('does not reopen the dropdown after the drawer hid it', async () => {
    const wrapper = mountLayout()
    await openDropdown(wrapper)
    expect(wrapper.find('.tab-dropdown').exists()).toBe(true)

    await wrapper.setProps({ menuOpen: true })
    await wrapper.setProps({ menuOpen: false })

    expect(wrapper.find('.tab-dropdown').exists()).toBe(false)
  })

  it('does not reopen the dropdown after the tab count hid it', async () => {
    const wrapper = mountLayout()
    await openDropdown(wrapper)

    await wrapper.setProps({ tabs: [tabs[0]] })
    await wrapper.setProps({ tabs })

    expect(wrapper.find('.tab-dropdown').exists()).toBe(false)
  })

  it('titles the llms screen as LLMs', () => {
    const wrapper = mountLayout({ activeScreen: 'llms', tabs: [], activeTab: null })
    expect(wrapper.find('.header').text()).toBe('LLMs')
  })
})
