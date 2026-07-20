<template>
  <div class="sidebar-list">
    <div class="sidebar-header-container">
      <slot v-if="$slots.header" name="header"></slot>
      <h3 v-else-if="!isMobile" class="font-sans sidebar-header">{{ title }}</h3>
    </div>
    <div class="action-slot">
      <slot name="actions"> </slot>
    </div>
    <div class="sidebar-content">
      <slot :isMobile="isMobile"></slot>
    </div>
  </div>
</template>

<style scoped>
.sidebar-list {
  border-radius: 0px;
  padding-left: 0;
  padding-right: 0;

  /* height: 100%; */
}

.sidebar-content {
  display: flex;
  flex-direction: column;
  margin-left: 0;
  margin-right: 0;
}

.sidebar-header-container {
  padding: 0 14px 4px;
}

.action-slot {
  padding: 0 14px 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.sidebar-header {
  font-weight: 600;
  font-size: 16px;
  color: var(--text-color);
  margin: 0;
  padding-left: 0;
  padding-right: 0;
}

.action-slot :deep(.button-container) {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sidebar-control-gap);
}

.action-slot :deep(.button-container > button),
.action-slot :deep(.button-container > .btn) {
  min-height: var(--sidebar-control-height);
  height: var(--sidebar-control-height);
  padding: 0 12px;
  background-color: transparent;
  border-color: var(--border-light);
  border-radius: var(--sidebar-control-radius);
}

.action-slot :deep(.creator-container) {
  padding-top: 2px;
}

@media screen and (max-width: 768px) {
  .sidebar-list {
    display: flex;
    flex-direction: column;
    position: relative;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .sidebar-content {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    margin-bottom: calc(48px + env(safe-area-inset-bottom));
    -webkit-overflow-scrolling: touch;
  }

  /* Every sidebar's primary create action uses the same bottom CTA on mobile. */
  .sidebar-header-container :deep(.sidebar-primary-create) {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10;
    width: auto;
    min-height: calc(48px + env(safe-area-inset-bottom));
    height: calc(48px + env(safe-area-inset-bottom));
    padding: 0 16px env(safe-area-inset-bottom);
    justify-content: center;
    border: 0;
    border-top: 1px solid var(--border-light);
    border-radius: 0 !important;
    background: var(--sidebar-bg);
    color: var(--text-color);
    font-size: 16px;
    box-shadow: 0 -8px 18px rgba(15, 23, 42, 0.08);
  }

  .sidebar-header-container :deep(.sidebar-primary-create:hover) {
    background: var(--button-mouseover, var(--sidebar-bg));
    color: var(--text-color);
  }

  .sidebar-header-container :deep(.sidebar-primary-create:active) {
    background: var(--button-mouseover, var(--sidebar-bg));
  }

  /* Inline desktop creators become a scrollable, available-screen overlay. */
  .action-slot :deep(.creator-container) {
    position: absolute;
    inset: 0;
    z-index: 20;
    box-sizing: border-box;
    width: 100%;
    max-width: none;
    min-height: 0;
    margin: 0;
    padding: 20px 18px calc(20px + env(safe-area-inset-bottom));
    overflow-x: hidden;
    overflow-y: auto;
    overscroll-behavior: contain;
    -webkit-overflow-scrolling: touch;
    background: var(--sidebar-bg);
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  .action-slot :deep(.creator-container form) {
    min-height: 100%;
  }

  .action-slot :deep(.creator-container h4) {
    margin: 0 0 20px;
    font-size: 20px;
  }

  .action-slot :deep(.creator-container .form-group) {
    margin-bottom: 18px;
  }

  .action-slot :deep(.creator-container .form-group label) {
    margin-bottom: 7px;
    font-size: 14px;
  }

  .action-slot :deep(.creator-container .form-group input),
  .action-slot :deep(.creator-container .form-group select),
  .action-slot :deep(.creator-container .form-group textarea) {
    box-sizing: border-box;
    width: 100%;
    min-height: 48px;
    padding: 10px 12px;
    font-size: 16px;
  }

}
</style>
<script lang="ts">
import { defineComponent, inject } from 'vue'

export default defineComponent({
  name: 'SidebarList',
  props: {
    title: {
      type: String,
      required: true,
    },
  },
  setup(props) {
    const isMobile = inject<boolean>('isMobile')
    return {
      title: props.title,
      isMobile,
    }
  },
})
</script>
