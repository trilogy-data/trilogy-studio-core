// chartOperationsManager.ts
import type { View } from 'vega'
import { ChromaChartHelpers } from './chartHelpers'

export class ChartOperationsManager {
  constructor(private chartHelpers: ChromaChartHelpers) {}

  // Download chart as PNG
  async downloadChart(
    activeView: View | null,
    emit: (event: string, ...args: any[]) => void,
  ): Promise<void> {
    await this.chartHelpers.downloadChart(activeView, emit)
  }

  // Refresh chart - emits refresh-click event
  refreshChart(emit: (event: string, ...args: any[]) => void): void {
    emit('refresh-click')
  }

  // Open chart spec in Vega Editor
  openInVegaEditor(spec: any): void {
    const editorUrl = 'https://vega.github.io/editor/'

    // Prepare the message to send
    const data = {
      mode: 'vega-lite',
      spec: JSON.stringify(spec),
      config: {},
      renderer: 'canvas',
      theme: 'default',
    }

    const editor = window.open(editorUrl, '_blank')

    const wait = 10_000 // total retry time in ms
    const step = 250 // retry interval in ms
    const { origin } = new URL(editorUrl)

    let count = ~~(wait / step)

    function listen(evt: MessageEvent) {
      if (evt.source === editor) {
        count = 0 // stop retries
        window.removeEventListener('message', listen, false)
      }
    }
    window.addEventListener('message', listen, false)

    // send message repeatedly until ack received or timeout
    function send() {
      if (count <= 0) {
        return
      }
      if (!editor) {
        console.error('Failed to open Vega Editor window')
        return
      }
      editor.postMessage(data, origin)
      setTimeout(send, step)
      count -= 1
    }

    setTimeout(send, step)
  }
}
