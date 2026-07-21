<template>
  <div class="provider-icon-container">
    <i v-if="providerType === 'anthropic'" class="mdi mdi-alpha-c-circle" title="Anthropic"></i>
    <i v-else-if="providerType === 'openai'" class="mdi mdi-flash" title="OpenAI"></i>
    <i v-else-if="providerType === 'google'" class="mdi mdi-google" title="Google"></i>
    <i v-else-if="providerType === 'openrouter'" class="mdi mdi-robot" title="OpenRouter"></i>
    <img
      v-else-if="providerType === 'deepseek'"
      :src="deepseekIcon"
      class="deepseek-icon"
      alt="DeepSeek"
      title="DeepSeek"
    />
    <i v-else-if="providerType === 'demo'" class="mdi mdi-history demo-icon" title="Demo"></i>
    <i v-else class="mdi mdi-robot" title="LLM Provider"></i>
  </div>
</template>
<script lang="ts">
import { defineComponent } from 'vue'
import deepseekIcon from '../../static/deepseek.png'
export default defineComponent({
  name: 'LLMProviderIcon',
  props: {
    providerType: {
      type: String,
      required: true,
    },
  },
  setup() {
    return { deepseekIcon }
  },
})
</script>
<style scoped>
.provider-icon-container {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
}
.mdi-alpha-c-circle {
  color: #5436da;
}
.mdi-flash {
  color: #10a37f;
}
.mdi-google {
  color: #4285f4;
}
.mdi-robot {
  color: #888888;
}
.demo-icon {
  color: #f59e0b;
}
.deepseek-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
}
</style>
