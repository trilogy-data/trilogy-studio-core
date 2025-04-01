/**
 * Adds a listener for selection events on a Vega chart
 *
 * @param view - The Vega View object from vegaEmbed
 * @param callback - Function to be called when selection changes
 * @returns Function to remove the event listener
 */
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

/**
 * Usage example:
 *
 * vegaEmbed('#chart', spec).then(result => {
 *   const removeListener = addChartSelectionListener(
 *     result.view,
 *     (selectionValue) => {
 *       console.log('Selection changed:', selectionValue);
 *     }
 *   );
 *
 *   // To clean up later:
 *   // removeListener();
 * });
 */
