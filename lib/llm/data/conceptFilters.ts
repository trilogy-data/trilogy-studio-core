// Shared filtering logic for concepts/symbols

export const DATE_PART_SUFFIXES = [
  '.year',
  '.quarter',
  '.month',
  '.week',
  '.day',
  '.day_of_week',
  '.year_start',
  '.month_start',
  '.hour',
  '.minute',
  '.second',
]

/**
 * Checks if a concept/symbol name is an auto-derived date part concept.
 * These are automatically generated from date fields (e.g., order_date.year, order_date.month).
 */
export function isAutoDerivedDateConcept(name: string): boolean {
  return DATE_PART_SUFFIXES.some((suffix) => name.endsWith(suffix))
}

/**
 * Filters out auto-derived date part concepts from an array.
 * Works with any object that has a 'name' or 'label' property.
 */
export function filterAutoDerivedConcepts<T extends { name?: string; label?: string }>(
  items: T[],
): T[] {
  return items.filter((item) => {
    const name = item.name || item.label || ''
    return !isAutoDerivedDateConcept(name)
  })
}
