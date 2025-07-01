export function getDefaultValueFromHash(key: string, fallback: string): string

export function getDefaultValueFromHash(key: string, fallback?: null): string | null

export function getDefaultValueFromHash(
  key: string,
  fallback: string | null = null,
): string | null {
  // Get the current hash from the URL
  const hash = window.location.hash
  // Ensure the hash starts with `#`
  if (!hash || !hash.startsWith('#')) {
    return fallback
  }
  // Parse the hash into key-value pairs
  const hashParams = new URLSearchParams(hash.slice(1)) // Remove the `#`
  // Return the value for the provided key, or fallback if it doesn't exist
  const value = hashParams.get(key)
  return value !== null ? value : fallback
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

export function removeHashFromUrl(key: string): void {
  // Get the current hash from the URL
  const hash = window.location.hash

  // Parse the hash into key-value pairs
  const hashParams = new URLSearchParams(hash.slice(1)) // Remove the `#`

  // Remove the specified key
  hashParams.delete(key)

  // Update the URL hash
  window.location.hash = `#${hashParams.toString()}`
}