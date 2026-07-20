<template>
  <div>
    <!-- Component that will display the credential modal dialog -->
    <teleport to="body" v-if="showPrompt">
      <div class="confirmation-overlay">
        <div class="confirmation-dialog">
          <h2>One Moment</h2>
          <h3>Loading Your Saved Studio Credentials</h3>
          <div v-if="!bypassMode" class="credential-prompt-content">
            <p>
              Enter a keyphrase to use saved credentials. (This is a secret phrase you created to
              encrypt your credentials. It's not stored anywhere, so keep it safe.) You'll be asked
              for it once per session. Credentials are encrypted in your browser local storage and
              are never sent anywhere.
            </p>
            <div v-if="storedCredentialLabels.length > 0" class="creator-container">
              <div class="text-bold">Your stored credentials:</div>
              <ul class="credential-list">
                <li v-for="label in storedCredentialLabels" :key="label" class="truncate-text">
                  {{ label }}
                </li>
              </ul>
            </div>

            <div class="form-group">
              <label for="keyphrase">Keyphrase</label>
              <input
                type="password"
                id="keyphrase"
                v-model="keyphraseInput"
                @keyup.enter="submitKeyphrase"
                placeholder="Enter the keyphrase you used to save credentials"
                data-testid="keyphrase-input"
              />
            </div>

            <div class="error-message" v-if="error">{{ error }}</div>

            <div class="credential-actions">
              <button
                @click="submitKeyphrase"
                class="primary-button"
                data-testid="submit-keyphrase"
              >
                Submit
              </button>
              <button @click="showBypassWarning" class="cancel-btn">Skip</button>
            </div>
          </div>

          <div v-else class="credential-prompt-content">
            <p class="warning-message">
              ⚠️ Warning: Bypassing encryption will cause all your saved credentials to become
              inaccessible.
            </p>
            <p>Your saved credentials will be lost and you will need to re-enter them.</p>

            <div class="credential-actions">
              <button @click="confirmBypass" class="confirm-btn">Confirm Skip</button>
              <button @click="cancelBypass" class="cancel-btn">Go Back</button>
            </div>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// Define props for the component - now receiving state from parent
defineProps({
  showPrompt: {
    type: Boolean,
    required: true,
  },
  bypassMode: {
    type: Boolean,
    required: true,
  },
  error: {
    type: String,
    default: '',
  },
  storedCredentialLabels: {
    type: Array as () => string[],
    default: () => [],
  },
})

// Define emits for events to parent
const emit = defineEmits([
  'submit-keyphrase',
  'show-bypass-warning',
  'confirm-bypass',
  'cancel-bypass',
])

// Local state only for input binding
const keyphraseInput = ref('')

const submitKeyphrase = () => {
  emit('submit-keyphrase', keyphraseInput.value)
  keyphraseInput.value = '' // Clear after submission
}

const showBypassWarning = () => {
  emit('show-bypass-warning')
}

const confirmBypass = () => {
  emit('confirm-bypass')
}

const cancelBypass = () => {
  emit('cancel-bypass')
}
</script>

<style scoped>
/* Using global variables from style.css */
h2 {
  font-size: var(--big-font-size);
  margin-top: 0;
  color: var(--text-color);
}

h3 {
  font-size: var(--font-size);
  color: var(--text-color);
}

.form-group {
  margin-bottom: 16px;
}

label {
  display: block;
  margin-bottom: 8px;
  font-weight: bold;
  color: var(--text-color);
}

input {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border);
  background-color: var(--query-window-bg);
  color: var(--query-window-font);
  font-size: var(--font-size);
  box-sizing: border-box;
}

.primary-button {
  background-color: var(--special-text);
  color: white;
}

.error-message {
  color: var(--error-color);
  margin-top: 8px;
}

.warning-message {
  background-color: rgba(204, 105, 0, 0.1);
  color: var(--special-text);
  padding: 12px;
  margin: 16px 0;
  border: 1px solid var(--border-light);
}

.credential-list {
  margin: 8px 0;
  padding-left: 24px;
}

.credential-list li {
  margin-bottom: 4px;
}

.credential-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 20px;
}

@media screen and (max-width: 768px) {
  .confirmation-overlay {
    align-items: stretch;
    background: var(--query-window-bg);
  }

  .confirmation-dialog {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: var(--mobile-viewport-height, 100dvh);
    padding: calc(20px + env(safe-area-inset-top)) 18px
      calc(12px + env(safe-area-inset-bottom));
    border-radius: 0;
    box-shadow: none;
    overflow: hidden;
  }

  .credential-prompt-content {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .credential-actions {
    position: sticky;
    bottom: 0;
    order: 10;
    flex: 0 0 auto;
    margin-top: auto;
    padding: 12px 0 0;
    background: var(--query-window-bg);
    border-top: 1px solid var(--border-light);
  }

  .credential-actions button {
    flex: 1 1 0;
    min-height: 48px;
    font-size: 16px;
  }
}
</style>
