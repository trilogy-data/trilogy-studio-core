export const KeySeparator = '+'

export function rsplit(str: string, delimiter: string): [string, string] {
  // Find the last index of the delimiter
  const lastIndex = str.lastIndexOf(delimiter)

  // If delimiter not found, return the whole string as the first element
  if (lastIndex === -1) {
    return [str, '']
  }

  // Split into left and right parts
  return [
    str.slice(0, lastIndex), // Everything before the last delimiter
    str.slice(lastIndex + 1), // Everything after the last delimiter
  ]
}

export function lastSegment(key: string, delimiter: string | null): string {
  delimiter = delimiter || KeySeparator
  const lastIndex = key.lastIndexOf(delimiter)
  const label = lastIndex !== -1 ? key.substring(lastIndex + delimiter.length) : key
  return label
}
