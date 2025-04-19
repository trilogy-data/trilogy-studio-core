export interface Credential {
  label: string
  type: CredentialType
  value: string
}

export interface EncryptedData {
  encryptedValue: string // Base64 encoded encrypted data
  iv: string // Base64 encoded IV
  salt: string // Base64 encoded salt
}

// --- Constants ---

export type CredentialType = 'connection' | 'llm'

export const DEFAULT_PBKDF2_ITERATIONS = 250000 // Increased iterations
export const SALT_LENGTH_BYTES = 16
export const IV_LENGTH_BYTES = 12
export const CREDENTIAL_PREFIX = 'trilogy_studio_' // Keep consistent prefix if needed

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  // Consider using a library or more robust conversion if facing issues
  // For modern environments, Buffer API might be available if not strictly browser-only
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function base64ToArrayBuffer(base64: string): Uint8Array {
  // Consider using a library or more robust conversion
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

// --- Custom Error Class ---

export class CredentialError extends Error {
  constructor(
    message: string,
    public cause?: unknown,
  ) {
    super(message)
    this.name = 'CredentialError'
  }
}

export class DecryptionError extends CredentialError {
  constructor(message: string = 'Decryption failed. Likely incorrect password.', cause?: unknown) {
    super(message, cause)
    this.name = 'DecryptionError'
  }
}

export interface CredentialManagerOptions {
  pbkdf2Iterations?: number
  credentialPrefix?: string
  useCredentialManagementApi?: boolean // Option to force localStorage
}
