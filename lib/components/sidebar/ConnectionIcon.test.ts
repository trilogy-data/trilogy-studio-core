import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ConnectionIcon from './ConnectionIcon.vue'

describe('ConnectionIcon', () => {
  it('gives Databricks connections their own icon', () => {
    const wrapper = mount(ConnectionIcon, {
      props: { connectionType: 'remote-worker:databricks' },
    })
    expect(wrapper.find('[data-testid="databricks-connection-icon"]').exists()).toBe(true)
    expect(wrapper.find('.mdi-database').exists()).toBe(false)
  })

  it('falls back to the generic database icon', () => {
    const wrapper = mount(ConnectionIcon, { props: { connectionType: 'snowflake' } })
    expect(wrapper.find('.mdi-database').exists()).toBe(true)
  })
})
