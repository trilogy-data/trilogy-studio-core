<template>
  <div class="container">
    <div class="content">
      <h1>Welcome to Trilogy Studio</h1>
      <div class="logo">
        <img :src="trilogyIcon" alt="Logo" class="logo-image" />
      </div>

      <p>Dive into a new editor, try the demo model, or review the help page to get started.</p>
      <div class="buttons">
        <editor-creator>
          <template v-slot="{ onClick }">
            <button @click="onClick" class="btn btn-primary">New Editor</button>
          </template>
        </editor-creator>
        <button @click="$emit('demo-started')" class="btn btn-secondary">Start Demo</button>
        <button @click="$emit('screen-selected', 'tutorial')" class="btn btn-tertiary">Help</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import trilogyIcon from '../static/trilogy.png'
import EditorCreator from './EditorCreator.vue'
</script>

<style scoped>
.container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: var(--bg-color);
  padding: 20px;
}

.content {
  text-align: center;
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  /* background-color: #444; */
  /* border-radius: 50%; */
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;

  margin-bottom: 20px;
}

.logo-image {
  width: 64px;
  transition: transform 1s ease-in-out;
}

.logo-image:hover {
  transform: rotate(360deg);
}

h1 {
  font-size: 24px;
  font-weight: bold;
}

.buttons {
  display: flex;
  gap: 10px;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 5px;
  font-size: 16px;
  height: 46px;
  cursor: pointer;
  transition: background-color 0.2s;
}

.btn-primary {
  border: 2px solid #007bff;
  background-color: transparent;
}

.btn-primary:hover {
  background-color: #0056b3;
}

.btn-secondary {
  border: 2px solid #28a745;
  background-color: transparent;
}

.btn-secondary:hover {
  background-color: #1e7e34;
}

.btn-tertiary {
  border: 2px solid #6c757d;
  background-color: transparent;
}

.btn-tertiary:hover {
  background-color: #545b62;
}
</style>
