<template>
  <div class="error-message" ref="errorMessage">
    <span class="error-text" data-testid="error-text"
      ><span class="error-icon">⚠️</span><slot></slot>
    </span>
    <div class="error-action">
      <slot name="action"></slot>
    </div>
  </div>
</template>

<script lang="ts">
export default {
  name: 'ErrorMessage',
  props: {},
}
</script>

<style scoped>
.error-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  background-color: #fef2f2;
  /* Light red background */
  color: var(--error-color);
  /* Bright red text */
  border-left: 5px solid #e60000;
  /* A bold left border for emphasis */
  border-right: 5px solid #e60000;
  /* A bold left border for emphasis */
  padding: 12px 20px;
  padding-top: 40px;
  justify-content: flex-start;
  font-family: 'Arial', sans-serif;
  font-size: 14px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  /* Soft shadow to lift the banner */
  height: 100%;
  vertical-align: middle;
  overflow-y: scroll;
  box-sizing: border-box;
}

.error-icon {
  /* margin-right: 12px; */
  font-size: 18px;
}

.error-text {
  /* flex-grow: 1; */
  font-weight: bold;
  white-space: pre-line;
  /* This will convert \n to actual line breaks */
  /* Handle long words */
}

.error-action {
  display: flex;
  justify-content: center;
  width: 100%;
}
</style>
