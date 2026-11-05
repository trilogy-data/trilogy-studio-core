import type { View } from 'vega'

export interface ChartSize {
  width: number
  height: number
}

/** Fit every Vega-Lite facet layout using measured outer dimensions, including
 * axes, legends and headers. Unit charts already use Vega-Lite's container fit.
 * Keep a positive plot size; if decorations alone exceed the viewport the host
 * provides scrolling. Iteration handles tick/label layout changing after resize.
 */
export async function fitFacetView(
  view: View,
  vegaSpec: any,
  available: ChartSize,
  measure: () => ChartSize | Promise<ChartSize>,
): Promise<void> {
  const layout = vegaSpec?.usermeta?.trilogyFacetLayout
  if (!layout || available.width <= 0 || available.height <= 0) return
  // These are the facet cell signals emitted by Vega-Lite. Check the compiled
  // spec so a compiler change safely falls back to scrolling, not a render error.
  const signals = new Set(vegaSpec.signals?.map((signal: { name: string }) => signal.name))
  if (!signals.has('child_width') || !signals.has('child_height')) return

  for (let attempt = 0; attempt < 6; attempt++) {
    const rendered = await measure()
    let changed = false
    for (const [dimension, count, signal] of [
      ['width', layout.columns, 'child_width'],
      ['height', layout.rows, 'child_height'],
    ] as const) {
      const overflow = Math.ceil(rendered[dimension] - available[dimension])
      if (!Number.isFinite(overflow) || overflow <= 0 || !(count > 0)) continue
      const current = Number(view.signal(signal))
      const next = Math.max(1, Math.floor(current - overflow / count))
      if (!Number.isFinite(next) || next >= current) continue
      view.signal(signal, next)
      changed = true
    }
    if (!changed) break
    await view.resize().runAsync()
  }
}
