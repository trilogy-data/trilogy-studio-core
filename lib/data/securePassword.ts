interface DatabaseCredential {
  label: string
  value: string
}

interface EncryptedDatabaseCredential {
  label: string
  encryptedValue: string
  iv: string // Initialization vector required for AES-GCM
  salt: string // For key derivation
}

/**
 * Derives a cryptographic key from a user password
 * @param password User provided password
 * @param salt Random salt for key derivation
 * @returns Promise<CryptoKey> The derived key
 */
async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  // Convert password to a key format
  const encoder = new TextEncoder()
  const passwordData = encoder.encode(password)

  // Import the password as a key
  const passwordKey = await window.crypto.subtle.importKey(
    'raw',
    passwordData,
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  )

  // Derive a 256-bit AES-GCM key from the password
  return window.crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256',
    },
    passwordKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

/**
 * Encrypts a string value using AES-GCM
 * @param value The value to encrypt
 * @param password User provided password
 * @returns Promise<{encryptedValue: string, iv: string, salt: string}>
 */
async function encryptValue(
  value: string,
  password: string,
): Promise<{ encryptedValue: string; iv: string; salt: string }> {
  // Generate a random salt for key derivation
  const salt = window.crypto.getRandomValues(new Uint8Array(16))

  // Generate a random initialization vector
  const iv = window.crypto.getRandomValues(new Uint8Array(12))

  // Derive encryption key from password
  const key = await deriveKey(password, salt)

  // Encrypt the data
  const encoder = new TextEncoder()
  const dataBuffer = encoder.encode(value)

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBuffer,
  )

  // Convert binary data to base64 strings for storage
  return {
    encryptedValue: arrayBufferToBase64(encryptedBuffer),
    iv: arrayBufferToBase64(iv),
    salt: arrayBufferToBase64(salt),
  }
}

/**
 * Decrypts an encrypted string value
 * @param encryptedValue The encrypted value as base64 string
 * @param iv The initialization vector as base64 string
 * @param salt The salt used for key derivation as base64 string
 * @param password User provided password
 * @returns Promise<string> The decrypted value
 */
async function decryptValue(
  encryptedValue: string,
  iv: string,
  salt: string,
  password: string,
): Promise<string> {
  // Convert base64 strings back to binary
  const encryptedBuffer = base64ToArrayBuffer(encryptedValue)
  const ivBuffer = base64ToArrayBuffer(iv)
  const saltBuffer = base64ToArrayBuffer(salt)

  // Derive the same key using the same salt
  const key = await deriveKey(password, saltBuffer)

  // Decrypt the data
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: ivBuffer },
    key,
    encryptedBuffer,
  )

  // Convert the decrypted data back to a string
  const decoder = new TextDecoder()
  return decoder.decode(decryptedBuffer)
}

// Helper functions for base64 conversion
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): Uint8Array {
  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes
}

/**
 * Stores database credentials securely in the browser with encryption
 * @param label Unique identifier for the credential
 * @param value The database connection string or credential value to store
 * @param password User provided password for encryption
 * @returns Promise<boolean> indicating if storage was successful
 */
export async function storeDatabaseCredential(
  label: string,
  value: string,
  password: string,
): Promise<boolean> {
  try {
    // Encrypt the value before storing
    const { encryptedValue, iv, salt } = await encryptValue(value, password)

    // Check if the Credential Management API and PasswordCredential are fully supported
    // @ts-ignore
    if (!('credentials' in navigator) || typeof window.PasswordCredential === 'undefined') {
      console.warn('Credential Management API not fully supported, using encrypted localStorage')

      const credentialToStore: EncryptedDatabaseCredential = {
        label,
        encryptedValue,
        iv,
        salt,
      }

      localStorage.setItem(`db_credential_${label}`, JSON.stringify(credentialToStore))
      return true
    }

    // Store metadata in localStorage for decryption later
    // (Credential API doesn't support storing multiple fields easily)
    localStorage.setItem(`db_credential_meta_${label}`, JSON.stringify({ iv, salt }))

    // @ts-ignore
    const credential = new window.PasswordCredential({
      id: label,
      password: encryptedValue, // Store encrypted value
      name: `Database Credential: ${label}`,
    })

    await navigator.credentials.store(credential)
    console.log('Encrypted credential stored successfully')
    return true
  } catch (error) {
    console.error('Error storing credential:', error)
    return false
  }
}

/**
 * Retrieves and decrypts stored database credentials from the browser
 * @param label The unique identifier for the credential to retrieve
 * @param password User provided password for decryption
 * @returns Promise<DatabaseCredential | null> The decrypted credential or null if not found/decryption fails
 */
export async function getDatabaseCredential(
  label: string,
  password: string,
): Promise<DatabaseCredential | null> {
  try {
    // Check if the Credential Management API and PasswordCredential are fully supported
    // @ts-ignore
    if (!('credentials' in navigator) || typeof window.PasswordCredential === 'undefined') {
      console.warn('Credential Management API not fully supported, using encrypted localStorage')

      const stored = localStorage.getItem(`db_credential_${label}`)
      if (!stored) return null

      const parsedData = JSON.parse(stored) as EncryptedDatabaseCredential

      try {
        // Attempt to decrypt
        const decryptedValue = await decryptValue(
          parsedData.encryptedValue,
          parsedData.iv,
          parsedData.salt,
          password,
        )

        return {
          label: parsedData.label,
          value: decryptedValue,
        }
      } catch (decryptError) {
        console.error('Error decrypting credential: Likely incorrect password', decryptError)
        return null
      }
    }

    // Get the credential from the Credential API
    const credential = await navigator.credentials.get({
      // @ts-ignore
      password: true,
      mediation: 'optional',
      id: label,
    })

    // @ts-ignore
    if (credential instanceof PasswordCredential) {
      // Get the metadata needed for decryption
      const metaString = localStorage.getItem(`db_credential_meta_${label}`)
      if (!metaString) {
        console.error('Encryption metadata not found')
        return null
      }

      const meta = JSON.parse(metaString)

      try {
        // @ts-ignore
        const encryptedValue = credential.password || ''
        const decryptedValue = await decryptValue(encryptedValue, meta.iv, meta.salt, password)

        return {
          // @ts-ignore
          label: credential.id,
          value: decryptedValue,
        }
      } catch (decryptError) {
        console.error('Error decrypting credential: Likely incorrect password', decryptError)
        return null
      }
    }

    // Fallback to localStorage if credential not found in Credential API
    const stored = localStorage.getItem(`db_credential_${label}`)
    if (!stored) return null

    const parsedData = JSON.parse(stored) as EncryptedDatabaseCredential

    try {
      // Attempt to decrypt
      const decryptedValue = await decryptValue(
        parsedData.encryptedValue,
        parsedData.iv,
        parsedData.salt,
        password,
      )

      return {
        label: parsedData.label,
        value: decryptedValue,
      }
    } catch (decryptError) {
      console.error('Error decrypting credential: Likely incorrect password', decryptError)
      return null
    }
  } catch (error) {
    console.error('Error retrieving credential:', error)
    return null
  }
}
