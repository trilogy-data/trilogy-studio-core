<template>
  <div id="interface" class="interface">
    <div class="mobile-select-bar">
      <!-- Left slot is always "up one step", so back sits in the same place on
           every screen: inside the drawer it pops a level, and on a terminal
           screen it reopens the drawer we drilled through to get here (its
           stack is preserved, so you land where you left off). -->
      <div class="bar-slot bar-left">
        <button
          type="button"
          class="bar-button bar-button-lg"
          :aria-label="leftControl.label"
          :title="leftControl.label"
          :data-testid="leftControl.testid"
          @click="emitLeftControl"
        >
          <i class="mdi" :class="leftControl.icon"></i>
        </button>
      </div>
      <!-- Tapping the title only ever navigates (opens the tab switcher).
           Renaming is the explicit pencil control, so no press-and-hold can
           drop you into an edit you didn't ask for. -->
      <div class="header-center">
        <input
          v-if="titleEditing"
          ref="titleInput"
          v-model="editableTitle"
          class="mobile-name-input"
          :data-testid="activeScreen === 'editors' ? 'editor-name-input' : 'page-title-input'"
          type="text"
          :aria-label="activeScreen === 'editors' ? 'Editor name' : 'Page title'"
          @blur="finishTitleEditing"
          @keyup.enter="finishTitleEditing"
          @keyup.esc="cancelTitleEditing"
        />
        <template v-else>
          <button
            v-if="!menuOpen && tabs.length > 1"
            type="button"
            class="tab-dropdown-container"
            aria-haspopup="menu"
            :aria-expanded="tabDropdownOpen"
            @click="toggleTabDropdown"
            ref="tabDropdownContainer"
          >
            <span class="current-tab-title">{{ currentTabTitle }}</span>
            <i
              :class="['mdi', 'dropdown-arrow', { rotated: tabDropdownOpen }]"
              class="mdi-chevron-down"
            ></i>
          </button>
          <span v-else class="header">{{ screenTitle }}</span>
        </template>

        <!-- Tab Dropdown -->
        <div
          v-if="tabDropdownOpen && tabs.length > 1"
          class="tab-dropdown"
          role="menu"
          ref="tabDropdown"
          @click.stop
        >
          <!-- Batch Actions Header -->
          <div class="tab-dropdown-header" v-if="tabs.length > 2">
            <button type="button" class="close-others-btn" @click="showCloseOthersConfirm = true">
              <i class="mdi mdi-close-box-multiple-outline"></i>
              <span>Close other tabs</span>
            </button>
          </div>

          <!-- Tab Items -->
          <div class="tab-dropdown-items">
            <TabDropdownItem
              v-for="tab in tabs"
              :key="tab.id"
              :tab="tab"
              :is-active="isActiveTab(tab)"
              :icon="getTabIcon(tab.screen)"
              @select="selectTab"
              @close="closeTab"
            />
          </div>
        </div>
      </div>
      <!-- Right slot mirrors the left: back walks up one level, home escapes the
           whole stack in a single tap. Home is the outermost control so it stays
           in one spot even when the rename button shares the slot. -->
      <div class="bar-slot bar-right">
        <button
          v-if="titleEditable && !menuOpen && !titleEditing"
          class="bar-button"
          type="button"
          title="Rename"
          aria-label="Rename"
          data-testid="edit-editor-name"
          @click="startTitleEditing"
        >
          <i class="mdi mdi-pencil-outline"></i>
        </button>
        <button
          v-if="!menuOpen || mobileNavigationLevel === 'detail'"
          class="bar-button"
          type="button"
          title="Back to menu root"
          aria-label="Back to menu root"
          data-testid="mobile-menu-home"
          @click="$emit('menu-home')"
        >
          <i class="mdi mdi-home-outline"></i>
        </button>
      </div>
    </div>

    <div class="interface-wrap">
      <div v-show="menuOpen" class="sidebar">
        <slot name="sidebar"></slot>
      </div>
      <div v-show="!menuOpen" class="nested-page-content" id="page-content">
        <slot></slot>
      </div>
    </div>

    <!-- Confirmation Dialog -->
    <div
      v-if="showCloseOthersConfirm"
      class="close-confirm-overlay"
      @click="showCloseOthersConfirm = false"
    >
      <div class="close-confirm-dialog" role="dialog" aria-modal="true" @click.stop>
        <p>Close {{ otherTabsCount }} other tabs?</p>
        <div class="confirm-buttons">
          <button type="button" @click="showCloseOthersConfirm = false" class="cancel-btn">
            Cancel
          </button>
          <button type="button" @click="executeCloseOthers" class="confirm-btn">
            Close Others
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.interface {
  /* Single source of truth for the bar: the panes below subtract it, and
     Sidebar.vue reads it for its own mobile pane height. */
  --mobile-header-height: 35px;
  /* Widest the control clusters can get: 2 * 34px button + 12px slot padding on
     the right, which holds two. The title box is inset by this on both sides so
     it can never collide with them and stays symmetric about the viewport
     centre. */
  --mobile-header-gutter: 80px;

  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100vh;
  height: var(--mobile-viewport-height, 100dvh);
  /* No clipping here: the header is sticky and the dropdown overhangs it. */
  overflow: visible;
}

.mobile-select-bar {
  position: sticky;
  top: 0;
  z-index: 100;
  width: 100%;
  height: var(--mobile-header-height);
  min-height: var(--mobile-header-height);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: var(--bg-color);
  /* Safari: promote to its own layer so sticky repaints cleanly. */
  transform: translateZ(0);
  backface-visibility: hidden;
}

.bar-slot {
  display: flex;
  align-items: center;
  height: 100%;
  padding: 0 6px;
  z-index: 2;
}

/* Centred against the viewport rather than against the leftover space between
   the two clusters, so the title doesn't drift as controls appear/disappear. */
.header-center {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 2 * var(--mobile-header-gutter));
  display: flex;
  justify-content: center;
  align-items: center;
}

.bar-button {
  width: 34px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-color);
  font-size: 17px;
  cursor: pointer;
}

/* Chevron/hamburger read small at the icon-button size, so bump the glyph. */
.bar-button-lg {
  font-size: 22px;
}

.bar-button:hover,
.bar-button:focus-visible {
  background: var(--button-mouseover);
}

.mobile-name-input {
  width: 100%;
  height: 27px;
  min-width: 0;
  padding: 0 8px;
  border: 1px solid rgba(var(--special-text-rgb, 37, 99, 235), 0.45);
  border-radius: 6px;
  background: var(--bg-color);
  color: var(--text-color);
  /* Stays at 16px: anything smaller makes iOS Safari zoom on focus. */
  font-size: 16px;
  font-weight: 500;
  box-shadow: 0 0 0 2px rgba(var(--special-text-rgb, 37, 99, 235), 0.08);
}

/* Shared by the plain title and the tab-switcher label: never wrap, never push
   the centre group wider than its box — long dashboard names just truncate. */
.header,
.current-tab-title {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.header {
  width: 100%;
  text-align: center;
}

/* Tab Dropdown Styles */
.tab-dropdown-container {
  display: flex;
  align-items: center;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background-color 0.2s ease;
  user-select: none;
}

.tab-dropdown-container:hover {
  background-color: var(--button-mouseover);
}

.current-tab-title {
  margin-right: 6px;
}

.dropdown-arrow {
  font-size: 14px;
  transition: transform 0.2s ease;
  flex-shrink: 0;
}

.dropdown-arrow.rotated {
  transform: rotate(180deg);
}

.tab-dropdown {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  background-color: var(--bg-color);
  border: 1px solid var(--border);
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1001;
  min-width: 200px;
  max-width: 280px;
  padding: 4px 0;
  margin-top: 4px;
}

/* New styles for batch actions header */
.tab-dropdown-header {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border);
  background-color: var(--bg-color-light, var(--bg-color));
}

.close-others-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--button-bg, var(--bg-color));
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 12px;
  font-size: 14px;
  color: var(--text-color);
  cursor: pointer;
  transition: background-color 0.2s ease;
  width: 100%;
}

.close-others-btn:hover:not(:disabled) {
  background-color: var(--button-mouseover);
}

.close-others-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.close-others-btn i {
  font-size: 16px;
}

/* The only scroller in the dropdown: capping the wrapper too left an outer
   scroll container that could never move, and kept the batch header from
   staying put while the list scrolled under it. */
.tab-dropdown-items {
  max-height: 240px;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

/* Confirmation dialog styles */
.close-confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1002;
}

.close-confirm-dialog {
  background-color: var(--bg-color);
  border-radius: 8px;
  padding: 20px;
  margin: 20px;
  max-width: 300px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.close-confirm-dialog p {
  margin: 0 0 16px 0;
  text-align: center;
  font-size: 16px;
  color: var(--text-color);
}

.confirm-buttons {
  display: flex;
  gap: 8px;
}

.confirm-buttons button {
  flex: 1;
  padding: 8px 16px;
  border-radius: 4px;
  border: 1px solid var(--border);
  cursor: pointer;
  font-size: 14px;
  transition: background-color 0.2s ease;
}

.cancel-btn {
  background-color: var(--bg-color);
  color: var(--text-color);
}

.cancel-btn:hover {
  background-color: var(--button-mouseover);
}

.confirm-btn {
  background-color: var(--error-color, #dc3545);
  color: white;
  border-color: var(--error-color, #dc3545);
}

.confirm-btn:hover {
  background-color: var(--error-color-dark, #c82333);
}

.interface-wrap {
  display: flex;
  flex-wrap: nowrap;
  flex: 1 1 auto;
  isolation: isolate;
  box-sizing: border-box;
  /* The panes below own their scrolling; clipping here would fight them. */
  overflow: visible;
}

.sidebar {
  background-color: var(--sidebar-bg);
  display: flex;
  flex-direction: column;
  flex: 1 1 auto;
  height: calc(100vh - var(--mobile-header-height));
  height: calc(var(--mobile-viewport-height, 100dvh) - var(--mobile-header-height));
  width: 100%;
  z-index: 51;
  overflow-y: auto;
  /* Add iOS-specific scrolling properties */
  -webkit-overflow-scrolling: touch;
}

.nested-page-content {
  flex: 1 1 auto;
  height: calc(100vh - var(--mobile-header-height));
  height: calc(var(--mobile-viewport-height, 100dvh) - var(--mobile-header-height));
  min-width: 0;
  z-index: 1;
  overflow: auto;
  /* Improve scrolling on iOS Safari */
  -webkit-overflow-scrolling: touch;
  position: relative;
}

/* Ensure safe area insets are respected on newer iPhones */
@media screen and (max-width: 768px) {
  .mobile-select-bar {
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
  }
}

/* The dropdown is centred on a box already inset by the gutters, so its
   200-280px width fits even a 320px viewport without a small-screen override. */
</style>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import TabDropdownItem from './TabDropdownItem.vue'
import { getTabIcon, getScreenLabel } from './screenPresentation'
import { type Tab } from '../../stores/useScreenNavigation'

export interface Props {
  menuOpen: boolean
  mobileNavigationLevel?: 'root' | 'detail'
  mobileNavigationTitle?: string
  activeScreen: string
  tabs?: Tab[]
  activeTab: string | null
  titleEditable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  tabs: () => [],
  mobileNavigationLevel: 'root',
  mobileNavigationTitle: '',
  titleEditable: false,
})

// Emits
const emit = defineEmits<{
  'menu-toggled': []
  'menu-back': []
  'menu-home': []
  'tab-selected': [data: Tab]
  'tab-closed': [tabId: string]
  'close-other-tabs': [tabId: string]
  'active-title-updated': [title: string]
}>()

// Reactive data
const tabDropdownOpen = ref(false)
const showCloseOthersConfirm = ref(false)
const titleEditing = ref(false)
const editableTitle = ref('')
/** What the in-progress edit was started on; see finishTitleEditing. */
const titleEditTarget = ref<string | null>(null)

// Template refs
const tabDropdownContainer = ref<HTMLElement>()
const tabDropdown = ref<HTMLElement>()
const titleInput = ref<HTMLInputElement>()

// Computed properties
const screenTitle = computed(() => {
  if (props.menuOpen) {
    return props.mobileNavigationLevel === 'detail' ? props.mobileNavigationTitle : 'Menu'
  }
  if (props.activeScreen) {
    return getScreenLabel(props.activeScreen)
  }
  return 'Trilogy'
})

const currentTabTitle = computed(() => {
  if (props.tabs.length === 0) {
    return screenTitle.value
  }

  const currentTab = props.tabs.find((tab) => tab.id === props.activeTab)
  return currentTab?.title || screenTitle.value
})

const otherTabsCount = computed(() => {
  return props.tabs.filter((tab) => !isActiveTab(tab)).length
})

/** Identifies what the header is currently titling, so an edit can be pinned to it. */
const titleTarget = computed(() => `${props.activeScreen}::${props.activeTab ?? ''}`)

/**
 * The left control is always "up one step", so it occupies the same slot on
 * every screen. Only the drawer root has nothing above it, and there the
 * hamburger dismisses back to the content instead.
 */
const leftControl = computed<{
  icon: string
  label: string
  testid: string
  event: 'menu-back' | 'menu-toggled'
}>(() => {
  if (!props.menuOpen) {
    // The drawer keeps its stack while closed, so this lands where we left off.
    return {
      icon: 'mdi-chevron-left',
      label: 'Back to menu',
      testid: 'mobile-menu-toggle',
      event: 'menu-toggled',
    }
  }
  if (props.mobileNavigationLevel === 'detail') {
    return {
      icon: 'mdi-chevron-left',
      label: 'Back',
      testid: 'mobile-menu-back',
      event: 'menu-back',
    }
  }
  return { icon: 'mdi-menu', label: 'Menu', testid: 'mobile-menu-toggle', event: 'menu-toggled' }
})

// Methods
const toggleTabDropdown = (): void => {
  tabDropdownOpen.value = !tabDropdownOpen.value
}

const closeTabDropdown = (): void => {
  tabDropdownOpen.value = false
}

// The template also gates the dropdown on these: opening the drawer or dropping
// back to a single tab hides it without clearing the flag, and it would then pop
// back open unprompted the next time the trigger renders.
watch([() => props.menuOpen, () => props.tabs.length], closeTabDropdown)

const startTitleEditing = async (): Promise<void> => {
  if (!props.titleEditable || props.menuOpen) return
  editableTitle.value = currentTabTitle.value
  titleEditTarget.value = titleTarget.value
  titleEditing.value = true
  await nextTick()
  titleInput.value?.focus()
  titleInput.value?.select()
}

const finishTitleEditing = (): void => {
  if (!titleEditing.value) return
  const target = titleEditTarget.value
  titleEditing.value = false
  titleEditTarget.value = null
  // The commit is pinned to whatever we started editing. A blur can land after
  // navigation has already moved on — iOS in particular defers it past the tap
  // that caused it — and committing then would rename the thing we just opened
  // to the title of the thing we left. Drop the edit instead.
  if (target !== titleTarget.value) return
  const title = editableTitle.value.trim()
  if (title && title !== currentTabTitle.value) {
    emit('active-title-updated', title)
  }
}

const cancelTitleEditing = (): void => {
  titleEditing.value = false
  titleEditTarget.value = null
}

// Navigating away abandons the edit rather than leaving a stale input open over
// the new screen. Belt and braces with the pin above, which covers the case
// where the blur fires too late for this to have run first.
watch([titleTarget, () => props.menuOpen], cancelTitleEditing)

const selectTab = (tab: Tab): void => {
  emit('tab-selected', tab)
  closeTabDropdown()
}

const closeTab = (tabId: string): void => {
  emit('tab-closed', tabId)
}

const isActiveTab = (tab: Tab): boolean => {
  return tab.id === props.activeTab
}

const executeCloseOthers = (): void => {
  showCloseOthersConfirm.value = false
  // Without a tab to keep, "close others" would close everything.
  if (!props.activeTab) return
  emit('close-other-tabs', props.activeTab)
}

// Spelled out rather than `emit(leftControl.value.event)`: the emit overloads
// don't accept a union of event names.
const emitLeftControl = (): void => {
  if (leftControl.value.event === 'menu-back') emit('menu-back')
  else emit('menu-toggled')
}

// Handle clicks outside the dropdown
const handleOutsideClick = (event: Event): void => {
  if (!tabDropdownOpen.value) return

  const target = event.target as Element
  const dropdown = tabDropdown.value
  const container = tabDropdownContainer.value

  if (dropdown && container && !dropdown.contains(target) && !container.contains(target)) {
    closeTabDropdown()
  }
}

// Escape dismisses the topmost layer only, so it unwinds one step at a time
// rather than clearing the confirm and the dropdown behind it in one press.
const handleEscape = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape') return
  if (showCloseOthersConfirm.value) {
    showCloseOthersConfirm.value = false
  } else if (tabDropdownOpen.value) {
    closeTabDropdown()
  }
}

// Lifecycle hooks
onMounted(() => {
  document.addEventListener('click', handleOutsideClick)
  document.addEventListener('keydown', handleEscape)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleOutsideClick)
  document.removeEventListener('keydown', handleEscape)
})
</script>
