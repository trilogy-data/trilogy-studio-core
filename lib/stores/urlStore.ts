export function getDefaultValueFromHash(key: string): string | null {
  // Get the current hash from the URL
  const hash = window.location.hash

  // Ensure the hash starts with `#`
  if (!hash || !hash.startsWith('#')) {
    return null
  }

  // Parse the hash into key-value pairs
  const hashParams = new URLSearchParams(hash.slice(1)) // Remove the `#`

  // Return the value for the provided key, or `null` if it doesn't exist
  return hashParams.get(key)
}

export function pushHashToUrl(key: string, value: string): void {
  // Get the current hash from the URL
  const hash = window.location.hash

  // Parse the hash into key-value pairs
  const hashParams = new URLSearchParams(hash.slice(1)) // Remove the `#`

  // Set or update the key-value pair
  hashParams.set(key, value)

  // Update the URL hash
  window.location.hash = `#${hashParams.toString()}`
}
