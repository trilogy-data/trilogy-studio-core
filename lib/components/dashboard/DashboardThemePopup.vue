<script setup lang="ts">
/**
 * Dashboard container theme picker.
 *
 * The vocabulary comes from dashboards/theme.ts rather than being restated
 * here, so this picker and the agent's set_dashboard_theme tool always offer
 * the same choices with the same descriptions.
 *
 * Every knob is tri-state: "Auto" means the field is unset and follows the
 * preset, which is genuinely different from picking the value the preset
 * happens to use — swapping presets later should move an Auto field along with
 * it. The preview is rendered with the real resolver, so what it shows is what
 * the dashboard will do.
 */
import { computed, inject, ref, watch } from 'vue'
import ModalDialog from '../ModalDialog.vue'
import { type Dashboard } from '../../dashboards/base'
import {
  resolveDashboardTheme,
  isSafeColor,
  DASHBOARD_PRESET_OPTIONS,
  DASHBOARD_CORNER_OPTIONS,
  DASHBOARD_DENSITY_OPTIONS,
  DASHBOARD_ELEVATION_OPTIONS,
  DASHBOARD_THEME_COLOR_OPTIONS,
  type DashboardTheme,
  type DashboardThemeColorKey,
} from '../../dashboards/theme'
import { useResolvedThemeMode } from '../../embed/config'
import type { UserSettingsStoreType } from '../../stores/userSettingsStore'

const props = defineProps<{
  dashboard: Dashboard | null
  isOpen: boolean
}>()

const emit = defineEmits<{
  close: []
  /** A partial patch to merge, or null to clear the theme entirely. */
  'theme-change': [theme: DashboardTheme | null]
}>()

const settingsStore = inject<UserSettingsStoreType | null>('userSettingsStore', null)
const themeMode = useResolvedThemeMode(settingsStore)

const theme = computed<DashboardTheme>(() => props.dashboard?.theme || {})
const activePreset = computed(() => theme.value.preset || 'default')

/** Preview of the dashboard as currently themed, and one preview per preset so
 *  the preset buttons show what they do rather than just naming it. */
const previewVars = computed(
  () => resolveDashboardTheme({ theme: theme.value, mode: themeMode.value }).vars,
)

function presetPreviewVars(preset: string) {
  // Preview the preset alone — not merged with the current overrides — so each
  // button shows what picking it actually looks like before other knobs apply.
  return resolveDashboardTheme({
    theme: { preset: preset as DashboardTheme['preset'] },
    mode: themeMode.value,
  }).vars
}

const isCustomized = computed(() => Object.keys(theme.value).length > 0)

function selectPreset(preset: string) {
  emit('theme-change', { preset: preset as DashboardTheme['preset'] })
}

/** `undefined` clears the field back to whatever the preset chose. The model
 *  spreads the patch over the current theme and re-sanitizes, which drops it. */
function setField(field: 'corners' | 'density' | 'elevation', value: string | undefined) {
  emit('theme-change', { [field]: value } as DashboardTheme)
}

function setMobileCards(value: boolean | undefined) {
  emit('theme-change', { mobileCards: value } as DashboardTheme)
}

function resetTheme() {
  emit('theme-change', null)
}

// --- Colors -----------------------------------------------------------------
// The text field is the source of truth: it accepts every notation the theme
// allows (hex, rgb(), hsl(), CSS names), while <input type="color"> can only
// round-trip 6-digit hex. Typing is committed on blur/enter so a half-typed
// value never reaches the dashboard.

const colorDrafts = ref<Record<string, string>>({})
const colorErrors = ref<Record<string, boolean>>({})

watch(
  [() => props.isOpen, theme],
  ([isOpen]) => {
    if (!isOpen) return
    const drafts: Record<string, string> = {}
    for (const color of DASHBOARD_THEME_COLOR_OPTIONS) {
      drafts[color.key] = theme.value[color.key] || ''
    }
    colorDrafts.value = drafts
    colorErrors.value = {}
  },
  { immediate: true },
)

/** What the native color input should show for a slot. It cannot represent
 *  "unset", so an unset slot falls back to a mode-appropriate stand-in. */
function swatchValue(key: DashboardThemeColorKey): string {
  const current = theme.value[key]
  if (current && /^#[0-9a-f]{6}$/i.test(current)) return current
  const option = DASHBOARD_THEME_COLOR_OPTIONS.find((c) => c.key === key)!
  return option.placeholder[themeMode.value]
}

function commitColor(key: DashboardThemeColorKey) {
  const raw = (colorDrafts.value[key] || '').trim()
  if (raw === '') {
    colorErrors.value = { ...colorErrors.value, [key]: false }
    if (theme.value[key]) emit('theme-change', { [key]: undefined } as DashboardTheme)
    return
  }
  if (!isSafeColor(raw)) {
    colorErrors.value = { ...colorErrors.value, [key]: true }
    return
  }
  colorErrors.value = { ...colorErrors.value, [key]: false }
  emit('theme-change', { [key]: raw } as DashboardTheme)
}

function pickColor(key: DashboardThemeColorKey, event: Event) {
  const value = (event.target as HTMLInputElement).value
  colorDrafts.value = { ...colorDrafts.value, [key]: value }
  colorErrors.value = { ...colorErrors.value, [key]: false }
  emit('theme-change', { [key]: value } as DashboardTheme)
}

function clearColor(key: DashboardThemeColorKey) {
  colorDrafts.value = { ...colorDrafts.value, [key]: '' }
  colorErrors.value = { ...colorErrors.value, [key]: false }
  emit('theme-change', { [key]: undefined } as DashboardTheme)
}

const colorOptions = DASHBOARD_THEME_COLOR_OPTIONS
const presetOptions = DASHBOARD_PRESET_OPTIONS
const cornerOptions = DASHBOARD_CORNER_OPTIONS
const densityOptions = DASHBOARD_DENSITY_OPTIONS
const elevationOptions = DASHBOARD_ELEVATION_OPTIONS
</script>

<template>
  <ModalDialog
    :show="isOpen"
    title="Dashboard theme"
    max-width="640px"
    test-id="dashboard-theme-popup"
    @close="emit('close')"
  >
    <div class="theme-picker">
      <p class="picker-intro">
        Styling for this dashboard only. Anything left on
        <strong>Auto</strong> follows the preset, and colors left blank follow your light/dark
        setting.
      </p>

      <section class="section">
        <h4 class="section-title">Preset</h4>
        <div class="preset-grid">
          <button
            v-for="option in presetOptions"
            :key="option.value"
            type="button"
            class="preset-card"
            :class="{ selected: activePreset === option.value }"
            :data-testid="`theme-preset-${option.value}`"
            :aria-pressed="activePreset === option.value"
            @click="selectPreset(option.value)"
          >
            <span
              class="preset-preview"
              :style="presetPreviewVars(option.value)"
              aria-hidden="true"
            >
              <span class="preview-card"><span class="preview-card-header"></span></span>
              <span class="preview-card"><span class="preview-card-header"></span></span>
            </span>
            <span class="preset-label">{{ option.label }}</span>
            <span class="preset-hint">{{ option.hint }}</span>
          </button>
        </div>
      </section>

      <section class="section">
        <h4 class="section-title">Adjustments</h4>

        <div class="knob-row">
          <span class="knob-label">Corners</span>
          <div class="chip-group" role="group" aria-label="Corners">
            <button
              type="button"
              class="chip"
              :class="{ selected: !theme.corners }"
              @click="setField('corners', undefined)"
            >
              Auto
            </button>
            <button
              v-for="option in cornerOptions"
              :key="option.value"
              type="button"
              class="chip"
              :class="{ selected: theme.corners === option.value }"
              :title="option.hint"
              @click="setField('corners', option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div class="knob-row">
          <span class="knob-label">Density</span>
          <div class="chip-group" role="group" aria-label="Density">
            <button
              type="button"
              class="chip"
              :class="{ selected: !theme.density }"
              @click="setField('density', undefined)"
            >
              Auto
            </button>
            <button
              v-for="option in densityOptions"
              :key="option.value"
              type="button"
              class="chip"
              :class="{ selected: theme.density === option.value }"
              :title="option.hint"
              @click="setField('density', option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div class="knob-row">
          <span class="knob-label">Elevation</span>
          <div class="chip-group" role="group" aria-label="Elevation">
            <button
              type="button"
              class="chip"
              :class="{ selected: !theme.elevation }"
              @click="setField('elevation', undefined)"
            >
              Auto
            </button>
            <button
              v-for="option in elevationOptions"
              :key="option.value"
              type="button"
              class="chip"
              :class="{ selected: theme.elevation === option.value }"
              :title="option.hint"
              @click="setField('elevation', option.value)"
            >
              {{ option.label }}
            </button>
          </div>
        </div>

        <div class="knob-row">
          <span class="knob-label">On mobile</span>
          <div class="chip-group" role="group" aria-label="Mobile cards">
            <button
              type="button"
              class="chip"
              :class="{ selected: theme.mobileCards === undefined }"
              @click="setMobileCards(undefined)"
            >
              Auto
            </button>
            <button
              type="button"
              class="chip"
              :class="{ selected: theme.mobileCards === false }"
              title="Panels flatten to the page background below 768px."
              @click="setMobileCards(false)"
            >
              Flatten
            </button>
            <button
              type="button"
              class="chip"
              :class="{ selected: theme.mobileCards === true }"
              title="Panels keep their card treatment on narrow screens."
              @click="setMobileCards(true)"
            >
              Keep cards
            </button>
          </div>
        </div>
      </section>

      <section class="section">
        <h4 class="section-title">Colors</h4>
        <p class="section-note">
          A color you set applies in both light and dark mode. Set them as a group so text stays
          readable, or leave them blank to follow the app theme.
        </p>
        <div class="color-list">
          <div v-for="option in colorOptions" :key="option.key" class="color-row">
            <label class="color-label" :for="`theme-color-${option.key}`">
              <span class="color-name">{{ option.label }}</span>
              <span class="color-hint">{{ option.hint }}</span>
            </label>
            <div class="color-controls">
              <input
                type="color"
                class="color-swatch"
                :class="{ unset: !theme[option.key] }"
                :value="swatchValue(option.key)"
                :aria-label="`${option.label} color`"
                @input="pickColor(option.key, $event)"
              />
              <input
                :id="`theme-color-${option.key}`"
                v-model="colorDrafts[option.key]"
                type="text"
                class="color-text"
                :class="{ invalid: colorErrors[option.key] }"
                :data-testid="`theme-color-${option.key}`"
                placeholder="Inherited"
                spellcheck="false"
                @blur="commitColor(option.key)"
                @keyup.enter="commitColor(option.key)"
              />
              <button
                type="button"
                class="color-clear"
                :disabled="!theme[option.key]"
                title="Clear — follow the app theme"
                aria-label="Clear color"
                @click="clearColor(option.key)"
              >
                <i class="mdi mdi-close" aria-hidden="true"></i>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="section">
        <h4 class="section-title">Preview</h4>
        <div class="live-preview" :style="previewVars">
          <div class="preview-card large">
            <div class="preview-card-header"><span class="preview-title-bar"></span></div>
            <div class="preview-body"><span class="preview-accent"></span></div>
          </div>
          <div class="preview-card large">
            <div class="preview-card-header"><span class="preview-title-bar"></span></div>
            <div class="preview-body"></div>
          </div>
        </div>
      </section>
    </div>

    <template #footer>
      <button
        type="button"
        class="btn btn-reset"
        :disabled="!isCustomized"
        data-testid="theme-reset-button"
        @click="resetTheme"
      >
        Reset to default
      </button>
      <button
        type="button"
        class="btn btn-done"
        data-testid="theme-done-button"
        @click="emit('close')"
      >
        Done
      </button>
    </template>
  </ModalDialog>
</template>

<style scoped>
.theme-picker {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.picker-intro,
.section-note {
  margin: 0;
  color: var(--dashboard-helper-text, var(--text-faint, #6b7280));
  font-size: 12px;
  line-height: 1.5;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--dashboard-helper-text, var(--text-faint, #6b7280));
}

/* --- Presets --- */

.preset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 10px;
}

.preset-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  text-align: left;
  color: var(--text-color);
  background: var(--query-window-bg, transparent);
  border: 1px solid var(--border-light, var(--border));
  border-radius: 10px;
  cursor: pointer;
}

.preset-card:hover {
  border-color: var(--special-text);
}

.preset-card.selected {
  border-color: var(--special-text);
  box-shadow: 0 0 0 2px rgba(var(--special-text-rgb, 37, 99, 235), 0.18);
}

.preset-preview {
  display: flex;
  flex-direction: column;
  gap: var(--dashboard-gutter, 10px);
  height: 62px;
  padding: 6px;
  overflow: hidden;
  background: var(--dashboard-canvas-bg, var(--main-bg-color, #f6f8fb));
  border-radius: 6px;
}

/* The thumbnail is a two-card miniature roughly a tenth of dashboard scale, so
   it opts out of the real header sizing — a 27px header would swallow a 25px
   card and leave every preset looking like an identical solid block. Corners,
   border, shadow, and gutter still come from the resolved theme, which is what
   these thumbnails are here to distinguish. The full-size header treatment
   shows up in the live preview at the bottom of the dialog. */
.preset-preview .preview-card-header {
  min-height: 0;
  height: 8px;
  padding: 0;
}

.preset-label {
  font-size: 13px;
  font-weight: 600;
}

.preset-hint {
  color: var(--dashboard-helper-text, var(--text-faint, #6b7280));
  font-size: 11px;
  line-height: 1.35;
}

/* Shared by the preset thumbnails and the live preview — both are driven by
   the real resolved custom properties, so they respond to every knob. */
.preview-card {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  background: var(
    --dashboard-card-bg,
    var(--trilogy-embed-dashboard-background, var(--dashboard-background, #ffffff))
  );
  border-radius: var(--dashboard-card-radius, 14px);
  box-shadow:
    inset 0 0 0 var(--dashboard-card-border-width, 1px)
      var(--dashboard-card-border-color, var(--border-color, var(--border, #d6dde6))),
    var(--dashboard-card-shadow, none);
}

.preview-card-header {
  display: block;
  min-height: var(--dashboard-header-min-height, 27px);
  padding: var(--dashboard-header-padding, 4px 12px 3px);
  background: var(--dashboard-header-bg, var(--panel-header-bg, rgba(148, 163, 184, 0.1)));
  border-bottom: var(--dashboard-header-border-width, 1px) solid
    var(--dashboard-card-border-color, var(--border-color, var(--border, #d6dde6)));
}

/* --- Colors --- */

.color-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.color-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.color-label {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  flex: 1 1 160px;
}

.color-name {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 500;
}

.color-hint {
  color: var(--dashboard-helper-text, var(--text-faint, #6b7280));
  font-size: 11px;
}

.color-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.color-swatch {
  width: 32px;
  height: 32px;
  padding: 0;
  background: none;
  border: 1px solid var(--border-light, var(--border));
  border-radius: 6px;
  cursor: pointer;
}

/* An unset slot shows a stand-in color, so mute it to read as "not chosen". */
.color-swatch.unset {
  opacity: 0.45;
}

.color-text {
  width: 128px;
  height: 32px;
  padding: 0 8px;
  color: var(--text-color);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  background: var(--query-window-bg, transparent);
  border: 1px solid var(--border-light, var(--border));
  border-radius: 6px;
}

.color-text:focus {
  outline: none;
  border-color: var(--special-text);
}

.color-text.invalid {
  border-color: var(--delete-color, #dc2626);
}

.color-clear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  color: var(--text-color);
  background: transparent;
  border: 1px solid var(--border-light, var(--border));
  border-radius: 6px;
  cursor: pointer;
}

.color-clear:disabled {
  opacity: 0.35;
  cursor: default;
}

/* --- Live preview --- */

.live-preview {
  display: flex;
  gap: var(--dashboard-gutter, 10px);
  height: 108px;
  padding: var(--dashboard-canvas-padding, 16px 18px 24px);
  overflow: hidden;
  background: var(--dashboard-canvas-bg, var(--main-bg-color, #f6f8fb));
  border: 1px solid var(--border-light, var(--border));
  border-radius: 8px;
}

.preview-card.large {
  display: flex;
  flex-direction: column;
}

.preview-body {
  display: flex;
  align-items: flex-end;
  flex: 1 1 auto;
  padding: 8px;
}

.preview-title-bar {
  display: block;
  width: 42%;
  height: 5px;
  background: var(--text-color, #1f2733);
  border-radius: 3px;
  opacity: 0.45;
}

.preview-accent {
  display: block;
  width: 60%;
  height: 22px;
  background: var(--special-text, #2563eb);
  border-radius: var(--dashboard-control-radius, 10px);
  opacity: 0.75;
}

/* --- Footer --- */

.btn {
  height: 36px;
  padding: 0 14px;
  color: var(--text-color);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: var(--ui-label-letter-spacing);
  background: transparent;
  border: 1px solid var(--border-light, var(--border));
  border-radius: 8px;
  cursor: pointer;
}

.btn:disabled {
  opacity: 0.45;
  cursor: default;
}

.btn-reset:not(:disabled):hover {
  border-color: var(--delete-color, #dc2626);
  color: var(--delete-color, #dc2626);
}

.btn-done {
  border-color: var(--special-text);
  background: var(--special-text);
  color: #ffffff;
}

/* --- Chips --- */

.knob-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.knob-label {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 500;
}

.chip-group {
  display: inline-flex;
  gap: 4px;
  flex-wrap: wrap;
}

.chip {
  height: 30px;
  padding: 0 12px;
  color: var(--text-color);
  font-size: 12px;
  background: var(--query-window-bg, transparent);
  border: 1px solid var(--border-light, var(--border));
  border-radius: 999px;
  cursor: pointer;
  white-space: nowrap;
}

.chip:hover {
  border-color: var(--special-text);
}

.chip.selected {
  border-color: var(--special-text);
  color: var(--special-text);
  background: rgba(var(--special-text-rgb, 37, 99, 235), 0.1);
  font-weight: 600;
}

@media (max-width: 560px) {
  .knob-row,
  .color-row {
    align-items: flex-start;
    flex-direction: column;
    gap: 6px;
  }

  .color-text {
    width: 100%;
    flex: 1 1 auto;
  }

  .color-controls {
    width: 100%;
  }
}
</style>
