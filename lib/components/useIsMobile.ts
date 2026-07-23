import { computed, inject, unref, type ComputedRef, type Ref } from 'vue'

/**
 * Reads the `isMobile` value provided by Manager.
 *
 * Manager provides a computed `Ref<boolean>`. Templates and Options-API `this`
 * auto-unwrap refs, so `inject<boolean>('isMobile', false)` *appears* to work —
 * but a `<script setup>` or plain `setup()` body reads the raw Ref, which is
 * always truthy. That silently enables mobile-only behaviour on desktop, and is
 * invisible until someone happens to branch on it outside a template.
 *
 * Always go through this helper so script and template agree.
 */
export function useIsMobile(): ComputedRef<boolean> {
  const injected = inject<Ref<boolean> | boolean>('isMobile', false)
  return computed(() => Boolean(unref(injected)))
}
