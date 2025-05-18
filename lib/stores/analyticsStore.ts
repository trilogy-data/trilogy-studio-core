import { defineStore } from 'pinia'

interface AnalyticsEvent {
  path: string
  title?: string
  event?: boolean
}

interface AnalyticsState {
  isEnabled: boolean
  sendTelemetry: boolean
}

export const useAnalyticsStore = defineStore('analytics', {
  state: (): AnalyticsState => ({
    isEnabled: true,
    sendTelemetry: true,
  }),

  actions: {
    /**
     * Log an analytics event to GoatCounter
     * @param path The event path to log
     * @param title Optional title for the event
     * @param isEvent Boolean indicating if this is an event (default: true)
     */
    log(path: string, title?: string, isEvent: boolean = true): void {
      if (!this.isEnabled) return

      // Only send telemetry if explicitly enabled
      if (!this.sendTelemetry) {
        console.debug('Telemetry disabled. Would have sent:', { path, title, isEvent })
        return
      }

      try {
        // The window.goatcounter interface
        if (window.goatcounter) {
          console.debug('Sending telemtryevent:', { path, title, isEvent })
          window.goatcounter.count({
            path,
            title,
            event: isEvent,
          })
        }
      } catch (error) {
        console.warn('Telemetry send failed:', error)
      }
    },

    /**
     * Enable or disable analytics tracking entirely
     */
    setEnabled(enabled: boolean): void {
      this.isEnabled = enabled
    },

    /**
     * Configure whether to actually send telemetry data
     */
    setSendTelemetry(send: boolean): void {
      this.sendTelemetry = send
    },

    /**
     * Initialize the analytics store with configuration
     */
    init({
      enabled = true,
      sendTelemetry = true,
    }: {
      enabled?: boolean
      sendTelemetry?: boolean
    }): void {
      this.isEnabled = enabled
      this.sendTelemetry = sendTelemetry
    },
  },
})

// Add TypeScript declaration for window.goatcounter
declare global {
  interface Window {
    goatcounter?: {
      count: (event: AnalyticsEvent) => void
    }
  }
}

export type AnalyticsStoreType = ReturnType<typeof useAnalyticsStore>
