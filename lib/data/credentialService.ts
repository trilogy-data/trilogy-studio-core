import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  DEFAULT_PBKDF2_ITERATIONS,
  CREDENTIAL_PREFIX,
  DecryptionError,
  CredentialError,
  SALT_LENGTH_BYTES,
  IV_LENGTH_BYTES,
} from './credentialHelpers'
import type {
  CredentialManagerOptions,
  Credential,
  CredentialType,
  EncryptedData,
} from './credentialHelpers'

// Type definition for the combined credential JSON blob
interface CredentialBlob {
  [key: string]: string // Maps credential key to encrypted value
}

// The unified credential ID for the Credential Management API
const UNIFIED_CREDENTIAL_ID = 'trilogy-studio-saved-passwords'

export class CredentialManager {
  private readonly pbkdf2Iterations: number
  private readonly credentialPrefix: string
  private readonly useCredentialApi: boolean
  private readonly isCredentialApiSupported: boolean

  // Request deduplication for Credential API operations
  private pendingCredentialBlobFetch: Promise<CredentialBlob> | null = null
  private pendingCredentialBlobStore: Promise<boolean> | null = null

  constructor(options: CredentialManagerOptions = {}) {
    this.pbkdf2Iterations = options.pbkdf2Iterations ?? DEFAULT_PBKDF2_ITERATIONS
    this.credentialPrefix = options.credentialPrefix ?? CREDENTIAL_PREFIX
    this.isCredentialApiSupported =
      typeof window !== 'undefined' &&
      'credentials' in navigator &&
      typeof window.PasswordCredential !== 'undefined'
    this.useCredentialApi =
      options.useCredentialManagementApi !== false && this.isCredentialApiSupported

    if (options.useCredentialManagementApi === true && !this.isCredentialApiSupported) {
      console.warn(
        'Credential Management API was requested but is not supported in this environment. Falling back to localStorage.',
      )
    }
  }

  // --- Private Crypto Methods ---
  private async deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder()
    const passwordData = encoder.encode(password)

    const passwordKey = await window.crypto.subtle.importKey(
      'raw',
      passwordData,
      { name: 'PBKDF2' },
      false,
      ['deriveKey'],
    )

    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: this.pbkdf2Iterations,
        hash: 'SHA-256',
      },
      passwordKey,
      { name: 'AES-GCM', length: 256 },
      true, // Key is extractable (false is generally better, but okay here)
      ['encrypt', 'decrypt'],
    )
  }

  private async encryptValue(value: string, password: string): Promise<EncryptedData> {
    const salt = window.crypto.getRandomValues(new Uint8Array(SALT_LENGTH_BYTES))
    const iv = window.crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES))
    const key = await this.deriveKey(password, salt)
    const encoder = new TextEncoder()
    const dataBuffer = encoder.encode(value)

    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      dataBuffer,
    )

    return {
      encryptedValue: arrayBufferToBase64(encryptedBuffer),
      iv: arrayBufferToBase64(iv),
      salt: arrayBufferToBase64(salt),
    }
  }

  private async decryptValue(encryptedData: EncryptedData, password: string): Promise<string> {
    try {
      const encryptedBuffer = base64ToArrayBuffer(encryptedData.encryptedValue)
      const ivBuffer = base64ToArrayBuffer(encryptedData.iv)
      const saltBuffer = base64ToArrayBuffer(encryptedData.salt)

      const key = await this.deriveKey(password, saltBuffer)

      const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBuffer },
        key,
        encryptedBuffer,
      )

      const decoder = new TextDecoder()
      return decoder.decode(decryptedBuffer)
    } catch (error) {
      // Wrap crypto errors (often DOMException) into a specific DecryptionError
      throw new DecryptionError(undefined, error)
    }
  }

  // --- Private Storage Key Generation ---

  private getStorageKey(label: string, type: CredentialType): string {
    // Ensures uniqueness across types for the same label
    return `${this.credentialPrefix}${type}_${label}`
  }

  private getCredentialBlobKey(label: string, type: CredentialType): string {
    // Create a unique key for each credential within the blob
    return `${type}_${label}`
  }

  // --- Credential API Blob Methods with Deduplication ---

  /**
   * Gets the credential blob from the Credential Management API with request deduplication
   * @returns The credential blob, or an empty object if not found
   */
  private getCredentialBlob(): Promise<CredentialBlob> {
    if (!this.useCredentialApi) {
      return Promise.resolve({})
    }

    // If there's already a pending fetch operation, reuse it
    if (this.pendingCredentialBlobFetch) {
      console.log('Reusing pending credential blob fetch request')
      return this.pendingCredentialBlobFetch
    }

    // Create a new fetch operation
    this.pendingCredentialBlobFetch = this.fetchCredentialBlob().finally(() => {
      // Clear the pending operation when it completes (success or failure)
      this.pendingCredentialBlobFetch = null
    })

    return this.pendingCredentialBlobFetch
  }

  /**
   * Actual implementation of the credential blob fetch
   * @returns The credential blob, or an empty object if not found
   */
  private async fetchCredentialBlob(): Promise<CredentialBlob> {
    try {
      const credential = (await navigator.credentials.get({
        password: true,
        mediation: 'optional', // Or 'silent' if preferred, but might fail
      })) as PasswordCredential | null
      // @ts-ignore
      if (
        credential &&
        // @ts-ignore
        credential instanceof PasswordCredential &&
        credential.id === UNIFIED_CREDENTIAL_ID
      ) {
        try {
          // @ts-ignore
          return JSON.parse(credential.password) as CredentialBlob
        } catch (error) {
          console.warn('Failed to parse credential blob:', error)
          return {}
        }
      }
      return {}
    } catch (error) {
      console.error('Error retrieving credential blob:', error)
      return {}
    }
  }

  /**
   * Stores the credential blob in the Credential Management API with request deduplication
   * @param blob The credential blob to store
   * @returns Promise<boolean> indicating if storage was successful
   */
  private storeCredentialBlob(blob: CredentialBlob): Promise<boolean> {
    if (!this.useCredentialApi) {
      return Promise.resolve(false)
    }

    // If there's already a pending store operation, reuse it
    // Note: This is a simplification - in a real app, you might want to queue writes
    // or ensure the latest blob is stored if there are multiple writes
    if (this.pendingCredentialBlobStore) {
      console.log('Reusing pending credential blob store request')
      return this.pendingCredentialBlobStore
    }

    // Create a new store operation
    this.pendingCredentialBlobStore = this.performCredentialBlobStore(blob).finally(() => {
      // Clear the pending operation when it completes (success or failure)
      this.pendingCredentialBlobStore = null
    })

    return this.pendingCredentialBlobStore
  }

  /**
   * Actual implementation of the credential blob store
   * @param blob The credential blob to store
   * @returns Promise<boolean> indicating if storage was successful
   */
  private async performCredentialBlobStore(blob: CredentialBlob): Promise<boolean> {
    try {
      console.log('Performing create credential request Credential API')
      // @ts-ignore
      const credential = new PasswordCredential({
        id: UNIFIED_CREDENTIAL_ID,
        password: JSON.stringify(blob),
        name: 'Trilogy Studio Saved Passwords',
      })
      await navigator.credentials.store(credential)
      return true
    } catch (error) {
      console.error('Error storing credential blob:', error)
      return false
    }
  }

  // --- Public API Methods ---

  async storeCredentials(
    credentials: Array<{
      label: string
      type: CredentialType
      value: string
    }>,
    password: string | null = null,
  ) {
    try {
      if (this.useCredentialApi) {
        console.log('Storing multiple credentials using Credential Management API.')
        // For Credential API, we need to:
        // 1. Get the current blob of all credentials
        // 2. Add or update each credential in the blob
        // 3. Store the updated blob
        const blob = await this.getCredentialBlob()
        for (const credential of credentials) {
          const blobKey = this.getCredentialBlobKey(credential.label, credential.type)
          blob[blobKey] = credential.value
          console.log(
            `Adding/updating credential '${credential.label}' (${credential.type}) in blob.`,
          )
        }
        // Store the updated blob
        const success = await this.storeCredentialBlob(blob)
        if (!success) {
          throw new CredentialError('Failed to store credential blob.')
        }
        console.log('Stored multiple credentials in Credential Management API.')
        return true
      } else {
        // Traditional localStorage approach
        if (!password) {
          throw new CredentialError(
            'Password is required for encryption when not using Credential API.',
          )
        }
        console.log('Storing multiple credentials using localStorage.')
        for (const credential of credentials) {
          const storageKey = this.getStorageKey(credential.label, credential.type)
          const encryptedData = await this.encryptValue(credential.value, password)
          const storePayload = JSON.stringify(encryptedData)

          console.log(
            `Storing credential '${credential.label}' (${credential.type}) in localStorage.`,
          )
          localStorage.setItem(storageKey, storePayload)
        }
        console.log('Stored multiple credentials in localStorage.')
        return true
      }
    } catch (error) {
      console.error('Error storing multiple credentials:', error)
      throw new CredentialError('Failed to store multiple credentials', error)
    }
  }

  /**
   * Stores a credential, encrypting its value. Uses Credential Management API if available,
   * otherwise falls back to localStorage.
   * @param label Unique identifier for the credential within its type.
   * @param type Type of credential ('connection' or 'llm').
   * @param value The sensitive value to store.
   * @param password The password used for encryption.
   * @throws {CredentialError} If storage fails.
   */
  async storeCredential(
    label: string,
    type: CredentialType,
    value: string,
    password: string | null = null,
  ): Promise<boolean> {
    try {
      if (this.useCredentialApi) {
        console.log(`Storing credential '${label}' (${type}) using Credential Management API.`)

        // For Credential API, we need to:
        // 1. Get the current blob of all credentials
        // 2. Add or update this credential in the blob
        // 3. Store the updated blob
        const blob = await this.getCredentialBlob()
        // Add or update this credential in the blob
        const blobKey = this.getCredentialBlobKey(label, type)
        blob[blobKey] = value
        console.log(blob)
        // Store the updated blob
        const success = await this.storeCredentialBlob(blob)
        if (!success) {
          throw new CredentialError('Failed to store credential blob.')
        }
        console.log(`Stored credential '${label}' (${type}) in Credential Management API.`)

        return true
      } else {
        // Traditional localStorage approach
        if (!password) {
          throw new CredentialError(
            'Password is required for encryption when not using Credential API.',
          )
        }

        const storageKey = this.getStorageKey(label, type)
        const encryptedData = await this.encryptValue(value, password)
        const storePayload = JSON.stringify(encryptedData)

        console.log(`Storing credential '${label}' (${type}) using localStorage.`)
        localStorage.setItem(storageKey, storePayload)
        return true
      }
    } catch (error) {
      console.error('Error storing credential:', error)
      throw new CredentialError(`Failed to store credential '${label}' (${type})`, error)
    }
  }

  /**
   * Retrieves and decrypts a stored credential.
   * @param label The identifier for the credential.
   * @param type Type of credential ('connection' or 'llm').
   * @param password The password used for decryption.
   * @returns The decrypted credential, or null if not found.
   * @throws {DecryptionError} If decryption fails (e.g., wrong password).
   * @throws {CredentialError} For other retrieval errors.
   */
  async getCredential(
    label: string,
    type: CredentialType,
    password: string,
  ): Promise<Credential | null> {
    try {
      let encryptedDataStr: string | null = null
      let decryptedValue: string
      if (this.useCredentialApi) {
        console.log(`Attempting to retrieve '${label}' (${type}) using Credential Management API.`)

        // For Credential API:
        // 1. Get the blob of all credentials
        // 2. Extract this specific credential from the blob

        const blob = await this.getCredentialBlob()
        const blobKey = this.getCredentialBlobKey(label, type)

        decryptedValue = blob[blobKey]
        if (!decryptedValue) {
          console.log(`Credential '${label}' (${type}) not found in Credential Management API.`)
          return null
        }
        return {
          label,
          type,
          value: decryptedValue,
        }
      } else {
        // Traditional localStorage approach
        const storageKey = this.getStorageKey(label, type)
        encryptedDataStr = localStorage.getItem(storageKey)
      }

      if (!encryptedDataStr) {
        return null
      }

      // Parse and decrypt
      const encryptedData = JSON.parse(encryptedDataStr) as EncryptedData
      decryptedValue = await this.decryptValue(encryptedData, password)

      return {
        label,
        type,
        value: decryptedValue,
      }
    } catch (error) {
      if (error instanceof DecryptionError) {
        console.error(`Decryption failed for '${label}' (${type}): ${error.message}`)
        throw error // Re-throw specific decryption error
      }
      console.error(`Error retrieving credential '${label}' (${type}):`, error)
      throw new CredentialError(`Failed to retrieve credential '${label}' (${type})`, error)
    }
  }

  /**
   * Deletes a stored credential.
   * @param label The identifier for the credential.
   * @param type Type of credential ('connection' or 'llm').
   * @returns Promise<boolean> indicating if deletion seemed successful (true) or item wasn't found (false)
   * @throws {CredentialError} If deletion fails for reasons other than not found.
   */
  async deleteCredential(label: string, type: CredentialType): Promise<boolean> {
    try {
      let found = false

      if (this.useCredentialApi) {
        console.log(`Attempting to delete '${label}' (${type}) from Credential Management API.`)

        // For Credential API:
        // 1. Get the current blob
        // 2. Remove this credential from the blob
        // 3. Store the updated blob

        const blob = await this.getCredentialBlob()
        const blobKey = this.getCredentialBlobKey(label, type)

        if (blobKey in blob) {
          delete blob[blobKey]
          found = true

          // Only update the blob in the Credential API if we actually removed something
          await this.storeCredentialBlob(blob)
          console.log(`Deleted credential '${label}' (${type}) from Credential API blob.`)
        }
      }

      // Always check localStorage too, in case it was stored there
      const storageKey = this.getStorageKey(label, type)
      const itemExistsInLocalStorage = localStorage.getItem(storageKey) !== null

      if (itemExistsInLocalStorage) {
        localStorage.removeItem(storageKey)
        found = true
        console.log(`Deleted credential '${label}' (${type}) from localStorage.`)
      }

      return found
    } catch (error) {
      console.error(`Error deleting credential '${label}' (${type}):`, error)
      throw new CredentialError(`Failed to delete credential '${label}' (${type})`, error)
    }
  }

  /**
   * Lists the labels and types of credentials stored via this manager.
   * Includes credentials from both localStorage and the Credential Management API.
   */
  async listCredentials(): Promise<Array<{ label: string; type: CredentialType }>> {
    const credentials: Array<{ label: string; type: CredentialType }> = []
    const prefix = this.credentialPrefix

    // First, check localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) {
        const keyWithoutPrefix = key.substring(prefix.length)
        const parts = keyWithoutPrefix.split('_')
        if (parts.length >= 2) {
          const type = parts[0] as CredentialType
          const label = parts.slice(1).join('_') // Re-join label if it contained underscores
          if (type === 'connection' || type === 'llm') {
            credentials.push({ label, type })
          }
        }
      }
    }

    // Then, check Credential API if available
    if (this.useCredentialApi) {
      const blob = await this.getCredentialBlob()

      for (const key in blob) {
        const parts = key.split('_')
        if (parts.length >= 2) {
          const type = parts[0] as CredentialType
          const label = parts.slice(1).join('_')

          // Avoid duplicates (in case the same credential exists in both storage mechanisms)
          if (type === 'connection' || type === 'llm') {
            if (!credentials.some((cred) => cred.label === label && cred.type === type)) {
              credentials.push({ label, type })
            }
          }
        }
      }
    }

    return credentials
  }

  getIsCredentialApiSupported(): boolean {
    return this.isCredentialApiSupported
  }
}
