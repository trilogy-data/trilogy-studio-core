<template>
  <div class="sidebar-item">
    <div
      class="sidebar-content"
      :class="{ 'sidebar-item-selected': isSelected }"
      @click="handleClick"
    >
      <!-- Indentation -->
      <div
        v-for="(_, index) in Array.from({ length: indent }, () => 0)"
        :key="index"
        class="sidebar-padding"
      ></div>
      <!-- Toggle button for collapsible items -->
      <button
        v-if="isCollapsible"
        @click.stop="handleToggle"
        class="chevron-button"
        :data-testid="`expand-${itemType}-${itemId}`"
        :aria-label="isCollapsed ? 'Expand section' : 'Collapse section'"
      >
        <i v-if="!isCollapsed" class="mdi mdi-menu-down chevron-icon"></i>
        <i v-else class="mdi mdi-menu-right chevron-icon"></i>
      </button>

      <!-- Custom icon slot or default icon -->
      <slot name="icon">
        <i v-if="icon" :class="`mdi ${icon} node-icon`"></i>
      </slot>

      <!-- Item content -->
      <span class="truncate-text" :data-testid="`${itemType}-${itemId}`">
        <slot name="name">{{ name }}</slot>
        <span v-if="extraInfo"> ({{ extraInfo }})</span>
      </span>

      <!-- Custom extra content slot -->

      <slot name="extra-content"></slot>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: 'SidebarItem',
  props: {
    itemId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    indent: {
      type: Number,
      default: 0,
    },
    isSelected: {
      type: Boolean,
      default: false,
    },
    isCollapsible: {
      type: Boolean,
      default: false,
    },
    isCollapsed: {
      type: Boolean,
      default: false,
    },
    icon: {
      type: String,
      default: '',
    },
    extraInfo: {
      type: [String, Number],
      default: '',
    },
    itemType: {
      type: String,
      default: 'item',
    },
  },
  emits: ['click', 'toggle'],
  methods: {
    handleClick() {
      this.$emit('click', this.itemId)
    },
    handleToggle() {
      this.$emit('toggle', this.itemId)
    },
  },
}
</script>

<style scoped>
.sidebar-item:hover {
  background-color: var(--button-mouseover);
}

.sidebar-content {
  display: flex;
  align-items: center;
  width: 100%;
  cursor: pointer;
  height: var(--sidebar-list-item-height);
}

.sidebar-padding {
  width: 7px;
  height: 22px;
  margin-right: 5px;
  border-right: 1px solid var(--border-light);
}

.node-icon {
  padding-right: 5px;
}

.truncate-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Mobile-friendly chevron button */
.chevron-button {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  cursor: pointer;
  transition: background-color 0.2s ease;
  min-width: var(--sidebar-item-height);
  min-height: var(--sidebar-item-height);
}

.chevron-icon {
  color: var(--text-color);
  pointer-events: none;
}

.extra-content {
  margin-left: auto;
  padding: 0;
}

/* Responsive adjustments for smaller screens */
@media (max-width: 768px) {
  .chevron-button {
    min-width: 32px;
    min-height: 32px;
  }

  .chevron-icon {
    font-size: 20px;
  }
}
</style>
