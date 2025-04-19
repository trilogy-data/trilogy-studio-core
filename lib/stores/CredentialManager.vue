<template>
  <div>
    <!-- Component that will display the credential modal dialog -->
    <teleport to="body" v-if="showPrompt">
      <div class="overlay">
        <div class="modal">
          <h2>One Moment</h2>
          <h3>You have set or are setting a saved credential.</h3>
          <div v-if="!bypassMode">
            <p>
              Enter a keyphrase to protect or access your saved credentials. This will be stored for
              your session - you'll only need to enter it once per visit.
            </p>
            <div v-if="storedCredentialLabels.length > 0" class="stored-credentials">
              <div class="text-bold">Your stored credentials:</div>
              <ul class="credential-list">
                <li v-for="label in storedCredentialLabels" :key="label">
                  {{ label }}
                </li>
              </ul>
            </div>

            <div class="form-group">
              <label for="keyphrase">Keyphrase:</label>
              <input
                type="password"
                id="keyphrase"
                v-model="keyphraseInput"
                @keyup.enter="submitKeyphrase"
                placeholder="Enter the keyphrase you used to save credentials"
              />
            </div>

            <div class="error" v-if="error">{{ error }}</div>

            <div class="button-group">
              <button @click="submitKeyphrase" class="primary-button">Submit</button>
              <button @click="showBypassWarning" class="secondary-button">Skip</button>
            </div>
            <p class="warning">
              ⚠️ Use a unique keyphrase. Storing secrets in browser storage has risks. A password
              manager also works well!
            </p>
          </div>

          <div v-else>
            <p class="warning">
              ⚠️ Warning: Bypassing encryption will cause all your saved credentials to become
              inaccessible.
            </p>
            <p>Your saved credentials will be lost and you will need to re-enter them.</p>

            <div class="button-group">
              <button @click="confirmBypass" class="danger-button">Confirm Skip</button>
              <button @click="cancelBypass" class="secondary-button">Go Back</button>
            </div>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, defineProps, defineEmits } from 'vue'

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
.overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.modal {
  background-color: var(--background-color);
  padding: 24px;
  width: 90%;
  max-width: 480px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

h2 {
  margin-top: 0;
  color: #2c3e50;
}

.form-group {
  margin-bottom: 16px;
}

label {
  display: block;
  margin-bottom: 8px;
  font-weight: bold;
}

input {
  width: 100%;
  padding-top: 10px;
  padding-bottom: 10px;
  border: 1px solid var(--border);
  font-size: 16px;
}

.button-group {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

button {
  padding: 10px 16px;
  font-size: 16px;
  cursor: pointer;
  border: none;
}

.primary-button {
  background-color: #4caf50;
  color: white;
}

.secondary-button {
  background-color: #f1f1f1;
  color: #333;
}

.danger-button {
  background-color: #f44336;
  color: white;
}

.warning {
  background-color: #fff3cd;
  color: #856404;
  padding: 12px;
  margin: 16px 0;
}

.error {
  color: #f44336;
  margin-top: 8px;
}

.stored-credentials {
  background-color: #e3f2fd;
  padding: 12px;
  margin: 16px 0;
}

.credential-list {
  margin: 8px 0;
  padding-left: 24px;
}

.credential-list li {
  margin-bottom: 4px;
}
</style>
