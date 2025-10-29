export type DrillDownTriggerEvent = {
  filters: Record<string, unknown[]>
}

export type DrillDownEvent = {
  add: string[]
  remove: string
  filter: string
}
