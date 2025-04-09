<template>
  <div class="expand layout-center hints">
    <div class="shortcuts">
      <div v-for="shortcut in shortcuts" class="shortcut-item">
        <div class="shortcut-name">{{ shortcut.name }}</div>
        <div class="shortcut">
          <span>{{ icon }}</span
          ><span v-for="key in shortcut.keys">{{ key }}</span>
        </div>
      </div>
    </div>
  </div>
</template>
<style scoped>
.hints {
  height: 100%;
  text-align: center;
}
.shortcuts {
  display: table;
  border-spacing: 5px;
  margin: 0 auto; /* Center the table */
}
.shortcut-item {
  display: table-row;
  color: var(--text-lighter);
  font-size: 95%;
  > div {
    display: table-cell;
  }
}
.shortcut-name {
  padding-right: 10px; /* Add some spacing between name and shortcut */
  text-align: right;
}
.shortcut {
  text-align: left;
  margin-right: 5px;
  & > span {
    display: inline-block;
    padding: 0 0.35rem;
    border-radius: 4px;
    margin-right: 0.35rem;
    font-size: 90%;
    font-weight: normal;
    line-height: 1.6;
    text-align: center;
    white-space: nowrap;
    vertical-align: baseline;
    border: 1px solid gray;
    border-radius: 5px;
    /* background: rgba(var(--main-bg-color), 0.15); */
    background: var(--light-bg-color);
    color: var(--text);
    transition:
      color 0.15s ease-in-out,
      background-color 0.15s ease-in-out,
      border-color 0.15s ease-in-out,
      box-shadow 0.15s ease-in-out;
  }
}
</style>
<script lang="ts">
function detectOperatingSystem(): string {
  // Browser environment
  if (typeof window !== 'undefined' && typeof navigator !== 'undefined') {
    const userAgent = navigator.userAgent.toLowerCase()

    if (userAgent.indexOf('win') !== -1) return 'Windows'
    if (userAgent.indexOf('mac') !== -1) return 'MacOS'
    if (userAgent.indexOf('iphone') !== -1 || userAgent.indexOf('ipad') !== -1) return 'iOS'
    if (userAgent.indexOf('android') !== -1) return 'Android'
    if (userAgent.indexOf('linux') !== -1) return 'Linux'

    return 'Unknown'
  }

  // Node.js environment
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
export default {
  data() {
    let os = detectOperatingSystem()
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
        // {
        //     name: 'New Tab',
        //     keys: ['T']
        // },
        // {
        //     name: 'Close Tab',
        //     keys: ['W']
        // },
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
        // {
        //     name: 'Format',
        //     keys: ['B']
        // }
      ],
      sysType: os,
    }
  },
  // props: {
  //   sysType: {
  //     type: String,
  //     required: false,
  //   },
  // },
  mounted() {},
  computed: {
    shortcuts(): Array<any> {
      // if (this.$store.getters.genAIConnections.length > 0) {
      //     return this.staticShortcuts.concat([
      //         {
      //             name: 'Generate Trilogy From Selected Text',
      //             keys: ['G']
      //         }
      //     ])
      // }
      return this.staticShortcuts
    },
    icon() {
      if (this.sysType == 'MacOS') {
        return '⌘'
      }
      return 'Ctrl'
    },
  },
}
</script>
