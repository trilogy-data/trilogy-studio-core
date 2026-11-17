import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectionPicker, { type ConnectionPickerOption } from './ConnectionPicker.vue'

const OPTIONS: ConnectionPickerOption[] = [
  {
    value: 'warehouse',
    label: 'warehouse',
    type: 'snowflake',
    detail: 'Snowflake',
    group: 'existing',
  },
  {
    value: 'dbx-test',
    label: 'dbx-test',
    type: 'remote-worker:databricks',
    detail: 'Databricks (Beta)',
    group: 'existing',
  },
  { value: 'new-duckdb', label: 'New DuckDB', type: 'duckdb', group: 'new' },
  {
    value: 'new-databricks',
    label: 'New Databricks (Beta)',
    type: 'remote-worker:databricks',
    group: 'new',
  },
]

function mountPicker(modelValue = '') {
  return mount(ConnectionPicker, {
    props: { modelValue, options: OPTIONS, testId: 'picker' },
    attachTo: document.body,
  })
}

const optionValues = (wrapper: ReturnType<typeof mountPicker>) =>
  wrapper
    .findAll('[role="option"]')
    .map((o) => o.attributes('data-testid')!.replace('picker-option-', ''))

describe('ConnectionPicker', () => {
  it('shows the selected option, including a preselected new connection type', () => {
    const wrapper = mountPicker('new-databricks')
    expect(wrapper.get('[data-testid="picker"]').text()).toContain('New Databricks (Beta)')
    wrapper.unmount()
  })

  it('groups existing connections before new ones', async () => {
    const wrapper = mountPicker()
    await wrapper.get('[data-testid="picker"]').trigger('click')
    expect(wrapper.findAll('.group-label').map((g) => g.text())).toEqual([
      'Existing connections',
      'Create a new connection',
    ])
    expect(optionValues(wrapper)).toEqual(['warehouse', 'dbx-test', 'new-duckdb', 'new-databricks'])
    wrapper.unmount()
  })

  it('filters on label and type detail', async () => {
    const wrapper = mountPicker()
    await wrapper.get('[data-testid="picker"]').trigger('click')
    await wrapper.get('[data-testid="picker-search"]').setValue('databricks')
    expect(optionValues(wrapper)).toEqual(['dbx-test', 'new-databricks'])

    await wrapper.get('[data-testid="picker-search"]').setValue('nothing-like-this')
    expect(wrapper.text()).toContain('No matching connections')
    wrapper.unmount()
  })

  it('selects with the keyboard', async () => {
    const wrapper = mountPicker()
    await wrapper.get('[data-testid="picker"]').trigger('click')
    const search = wrapper.get('[data-testid="picker-search"]')
    await search.setValue('databricks')
    await search.trigger('keydown', { key: 'ArrowDown' })
    await search.trigger('keydown', { key: 'Enter' })
    expect(wrapper.emitted('update:modelValue')).toEqual([['new-databricks']])
    expect(wrapper.find('[data-testid="picker-search"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('selects with the mouse', async () => {
    const wrapper = mountPicker('warehouse')
    await wrapper.get('[data-testid="picker"]').trigger('click')
    await wrapper.get('[data-testid="picker-option-dbx-test"]').trigger('mousedown')
    expect(wrapper.emitted('update:modelValue')).toEqual([['dbx-test']])
    wrapper.unmount()
  })
})
