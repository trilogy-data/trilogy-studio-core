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

export class CredentialManager {
  private readonly pbkdf2Iterations: number
  private readonly credentialPrefix: string
  private readonly useCredentialApi: boolean
  private readonly isCredentialApiSupported: boolean

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

  // --- Public API Methods ---

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
    const storageKey = this.getStorageKey(label, type)
    try {


      if (this.useCredentialApi) {
        console.log(`Storing credential '${label}' (${type}) using Credential Management API.`)
        // @ts-ignore
        const credential = new PasswordCredential({
          id: storageKey, // Use the full unique key as ID
          password: value, // store the value here as password
          name: `Trilogy Studio: ${type} - ${label}`, // User-friendly name
        })
        await navigator.credentials.store(credential)
        return true
      } else {
        if (!password) {
          throw new CredentialError('Password is required for encryption when not using Credential API.')
        }
        const encryptedData = await this.encryptValue(value, password)
        const storePayload = JSON.stringify(encryptedData) // Store IV/Salt *with* data
        console.log(`Storing credential '${label}' (${type}) using localStorage.`)
        localStorage.setItem(storageKey, storePayload)
        return true
      }
    } catch (error) {
      console.error('Error storing credential:', error)
      throw new CredentialError(`Failed to store credential '${label}' (${type})`, error)
    }
    return false
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
    const storageKey = this.getStorageKey(label, type)
    let storedPayload: string | null = null
    let credential: string | null = null;
    try {
      if (this.useCredentialApi) {
        console.log(`Attempting to retrieve '${label}' (${type}) using Credential Management API.`)
        const credential = (await navigator.credentials.get({
          password: true, // Indicates we want PasswordCredential
          // mediation: 'silent', // Or 'optional' if user interaction is okay
          // Using 'silent' might fail if the browser requires interaction.
          // 'optional' is safer but might pop up UI. Consider your UX needs.
          mediation: 'optional',
          // We can filter by ID if we know it exactly
          // id: storageKey // Note: ID matching might be strict or require user selection
        })) as PasswordCredential | null // Type assertion for TypeScript

        // Since 'get' without 'id' might return *any* password credential for the origin,
        // we need to check if the returned credential ID matches our expected key.
        // @ts-ignore
        if (
          credential &&
          // @ts-ignore
          credential instanceof PasswordCredential &&
          credential.id === storageKey
        ) {
          password = credential.password
        } else if (credential) {
          console.warn(
            `Credential API returned a credential (${credential.id}), but it didn't match the expected key (${storageKey}).`,
          )
          // Optionally, you could iterate if multiple credentials might be returned,
          // but PasswordCredential usually returns one or null based on filtering.
        }
      }

      // If not found via API (or API not used), try localStorage
      if (!storedPayload && (!this.useCredentialApi || this.isCredentialApiSupported === false)) {
        console.log(`Attempting to retrieve '${label}' (${type}) from localStorage.`)
        storedPayload = localStorage.getItem(storageKey)
      }

      if (!storedPayload) {
        console.log(`Credential '${label}' (${type}) not found.`)
        return null
      }

      // Parse and decrypt
      const encryptedData = JSON.parse(storedPayload) as EncryptedData
      const decryptedValue = await this.decryptValue(encryptedData, password)

      return {
        label: label, // Original label
        type: type, // Original type
        value: decryptedValue,
      }
    } catch (error) {
      if (error instanceof DecryptionError) {
        console.error(`Decryption failed for '${label}' (${type}): ${error.message}`)
        throw error // Re-throw specific decryption error
      }
      console.error(`Error retrieving credential '${label}' (${type}):`, error)
      // Don't throw DecryptionError for general errors, throw CredentialError
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
    const storageKey = this.getStorageKey(label, type)
    let found = false // Track if we think the item existed

    try {
      // Try deleting from localStorage first (always safe to try)
      const itemExistsInLocalStorage = localStorage.getItem(storageKey) !== null
      if (itemExistsInLocalStorage) {
        localStorage.removeItem(storageKey)
        found = true // It definitely existed in localStorage
        console.log(`Deleted credential '${label}' (${type}) from localStorage.`)
      }

      // If Credential API is supported and was likely used, attempt deletion there.
      // Note: There isn't a direct navigator.credentials.delete(id).
      // Deletion usually happens via browser UI or is tied to password manager sync.
      // We *can* try storing 'null' or an empty credential, but browser behavior varies.
      // The most reliable way user-side is often just removing from localStorage,
      // and letting the user manage Credential API entries via their browser's password manager.
      // For this example, we'll focus on the localStorage aspect.
      if (this.useCredentialApi && !itemExistsInLocalStorage) {
        // We could try a 'get' first to see if it exists in Credential API,
        // but that might trigger UI. For simplicity, we'll assume if it's not
        // in localStorage (when API is enabled), it might be in the API, but
        // we can't programmatically delete it reliably. We'll return true if
        // we deleted from localStorage or if API is enabled (assuming user manages it).
        console.warn(
          `Cannot programmatically delete credential '${label}' (${type}) from Credential Management API. Please manage via browser settings if needed.`,
        )
        // We can attempt to check if it existed using 'get' but it's imperfect
        // TODO evaluate this option
        // const cred = await navigator.credentials.get({ password: true, id: storageKey, mediation: 'silent' }).catch(() => null);
        // found = !!cred; // If get succeeds silently, it existed.
      }

      return found // Return true if we removed it from localStorage
    } catch (error) {
      console.error(`Error deleting credential '${label}' (${type}):`, error)
      throw new CredentialError(`Failed to delete credential '${label}' (${type})`, error)
    }
  }

  /**
   * Lists the labels and types of credentials stored via this manager (localStorage only).
   * Note: Cannot reliably list credentials stored solely in the Credential Management API.
   */
  listCredentials(): Array<{ label: string; type: CredentialType }> {
    const credentials: Array<{ label: string; type: CredentialType }> = []
    const prefix = this.credentialPrefix

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(prefix)) {
        const keyWithoutPrefix = key.substring(prefix.length)
        // Expecting format like "connection_myDbLabel" or "llm_myApiKeyLabel"
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
    return credentials
  }

  getIsCredentialApiSupported(): boolean {
    return this.isCredentialApiSupported
  }
}
