<template>
  <div :class="messageClass" ref="messageContainer">
    <span class="message-text" data-testid="message-text">
      <span class="message-icon">{{ iconEmoji }}</span>
      <slot></slot>
    </span>
    <div class="message-action">
      <slot name="action"></slot>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: 'MessageComponent',
  props: {
    type: {
      type: String as () => 'error' | 'information',
      default: 'error',
      validator: (value: string) => ['error', 'information'].includes(value)
    }
  },
  computed: {
    messageClass(): string {
      return this.type === 'information' ? 'information-message' : 'error-message';
    },
    iconEmoji(): string {
      return this.type === 'information' ? 'ℹ️' : '⚠️';
    }
  }
}
</script>

<style scoped>
.error-message,
.information-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 12px 20px;
  padding-top: 40px;
  justify-content: flex-start;
  font-family: 'Arial', sans-serif;
  font-size: 14px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  height: 100%;
  vertical-align: middle;
  overflow-y: scroll;
  box-sizing: border-box;
}

.error-message {
  background-color: #fef2f2; /* Light red background */
  color: var(--error-color); /* Bright red text */
  border-left: 5px solid #e60000; /* Bold left border for emphasis */
  border-right: 5px solid #e60000; /* Bold right border for emphasis */
}

.information-message {
  background-color: #eff6ff; /* Light blue background */
  color: #1e40af; /* Blue text */
  border-left: 5px solid #2563eb; /* Bold blue left border */
  border-right: 5px solid #2563eb; /* Bold blue right border */
}

.message-icon {
  font-size: 18px;
}

.message-text {
  font-weight: bold;
  white-space: pre-line; /* This will convert \n to actual line breaks */
}

.message-action {
  display: flex;
  justify-content: center;
  width: 100%;
}
</style>