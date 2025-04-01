export const addChartSelectionListener = (
  view: any,
  callback: (selectionValue: any) => void,
): (() => void) => {
  // The selection name should match what was defined in the spec
  const selectionName = 'chartSelection'

  // The event handler function
  const handleSelectionChange = (name: string, value: any) => {
    // The selection store signal name will be selectionName + '_store'
    if (name === `${selectionName}_store`) {
      // Simply pass the raw selection value to the callback
      callback(value)
    }
  }

  // Add the event listener
  view.addEventListener(`${selectionName}_store`, handleSelectionChange)

  // Return a function to remove the listener
  return () => {
    view.removeEventListener(`${selectionName}_store`, handleSelectionChange)
  }
}
