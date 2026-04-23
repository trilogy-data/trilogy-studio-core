<template>
  <div class="hints" data-testid="editor-shortcut-hints">
    <div class="hint-card">
      <div class="hint-header">
        <div>
          <div class="hint-title">Shortcuts</div>
        </div>
      </div>
      <div class="shortcuts">
        <div v-for="shortcut in shortcuts" :key="shortcut.name" class="shortcut-item">
          <div class="shortcut-name">{{ shortcut.name }}</div>
          <div class="shortcut">
            <span>{{ icon }}</span>
            <span v-for="key in shortcut.keys" :key="key">{{ key }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.hints {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 16px 24px;
  box-sizing: border-box;
}

.hint-card {
  width: 100%;
  height: 100%;
  padding: 18px 20px;
  display: flex;
  flex-direction: column;
  justify-content: center;
  border: none;
  border-radius: 0;
  background: transparent;
  opacity: 0.72;
  box-sizing: border-box;
}

.hint-header {
  margin-bottom: 16px;
  text-align: center;
}

.hint-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.shortcuts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: 14px;
  row-gap: 5px;
  margin: 0 auto;
  align-items: center;
  max-width: min(680px, 100%);
}

.shortcut-item {
  display: contents;
  color: var(--text-faint);
  font-size: 11px;
}

.shortcut-name {
  padding-right: 0;
  text-align: right;
  line-height: 1.45;
  letter-spacing: 0.01em;
  color: var(--text-faint);
}

.shortcut {
  text-align: left;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
}

.shortcut > span {
  display: inline-block;
  padding: 0 0.28rem;
  margin-right: 0;
  font-size: 10px;
  font-weight: normal;
  line-height: 1.35;
  text-align: center;
  white-space: nowrap;
  vertical-align: baseline;
  border: 1px solid rgba(148, 163, 184, 0.22);
  border-radius: 4px;
  background: rgba(148, 163, 184, 0.025);
  color: var(--text-faint);
  transition:
    color 0.15s ease-in-out,
    background-color 0.15s ease-in-out,
    border-color 0.15s ease-in-out,
    box-shadow 0.15s ease-in-out;
}

@media screen and (max-width: 768px) {
  .hints {
    padding: 12px 16px;
  }

  .hint-card {
    padding: 16px;
  }

  .hint-header {
    flex-direction: column;
    align-items: stretch;
    margin-bottom: 14px;
  }

  .shortcuts {
    grid-template-columns: 1fr;
    row-gap: 6px;
  }

  .shortcut-name {
    text-align: center;
  }

  .shortcut {
    justify-content: center;
  }
}
</style>

<script lang="ts">
import { defineComponent } from 'vue'

function detectOperatingSystem(): string {
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
    const userAgent = navigator.userAgent.toLowerCase()

    if (userAgent.indexOf('win') !== -1) return 'Windows'
    if (userAgent.indexOf('mac') !== -1) return 'MacOS'
    if (userAgent.indexOf('iphone') !== -1 || userAgent.indexOf('ipad') !== -1) return 'iOS'
    if (userAgent.indexOf('android') !== -1) return 'Android'
    if (userAgent.indexOf('linux') !== -1) return 'Linux'

    return 'Unknown'
  }

  if (typeof process !== 'undefined' && process.platform) {
    switch (process.platform) {
      case 'win32':
        return 'Windows'
      case 'darwin':
        return 'MacOS'
      case 'linux':
        return 'Linux'
      case 'android':
        return 'Android'
      case 'freebsd':
        return 'FreeBSD'
      case 'openbsd':
        return 'OpenBSD'
      case 'sunos':
        return 'SunOS'
      default:
        return process.platform
    }
  }

  return 'Unknown'
}

export default defineComponent({
  name: 'HintComponent',
  data() {
    const os = detectOperatingSystem()
    return {
      staticShortcuts: [
        {
          name: 'Run',
          keys: ['Enter'],
        },
        {
          name: 'Generate Query From Text (if LLM connection set)',
          keys: ['Shift', 'Enter'],
        },
        {
          name: 'Save All Editors',
          keys: ['S'],
        },
        {
          name: 'Find',
          keys: ['F'],
        },
        {
          name: 'Find and Replace',
          keys: ['H'],
        },
        {
          name: 'Format',
          keys: ['K'],
        },
      ],
      sysType: os,
    }
  },
  computed: {
    shortcuts(): Array<any> {
      return this.staticShortcuts
    },
    icon() {
      if (this.sysType === 'MacOS') {
        return 'Cmd'
      }
      return 'Ctrl'
    },
  },
})
</script>
