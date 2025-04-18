// src/types/credential-management.d.ts

/**
 * Custom type declarations for the Credential Management API.
 * WARNING: This is a workaround for issues loading the official @types package.
 * It may be incomplete or conflict if the original types are loaded later.
 */

declare global {
  /** Basic Credential interface */
  interface Credential {
    readonly id: string
    readonly type: string
  }

  /** Data used to construct a PasswordCredential */
  interface PasswordCredentialData {
    id: string
    password: string
    name?: string
    iconURL?: string
  }

  /** Represents a password-based credential */
  interface PasswordCredential extends Credential {
    readonly name: string | null
    readonly iconURL: string | null
    readonly password: string // The spec says this is not directly readable, but it's how it's used in PasswordCredentialData and returned from navigator.credentials.get sometimes. For practical typing here, we include it.
    readonly type: 'password'
  }

  /** Constructor for PasswordCredential - Added to the Window object */
  interface Window {
    PasswordCredential: {
      prototype: PasswordCredential
      new (data: PasswordCredentialData): PasswordCredential
    }
  }

  // --- Options for navigator.credentials.get() ---

  type CredentialMediationRequirement = 'silent' | 'optional' | 'required'

  interface CredentialRequestOptions {
    password?: boolean // To request a PasswordCredential
    mediation?: CredentialMediationRequirement
    signal?: AbortSignal
    // If filtering by specific credential types, more properties might be needed
    // For PasswordCredential specifically, filtering by 'id' is often done externally
  }

  // --- navigator.credentials ---

  interface CredentialsContainer {
    /** Retrieves a credential based on options */
    get(options?: CredentialRequestOptions): Promise<Credential | null>

    /** Stores a credential */
    store(credential: Credential): Promise<Credential | null> // Browser implementations vary, sometimes returns void

    /** Creates a credential */
    create(options?: any): Promise<Credential | null> // Define 'any' for simplicity, refine if needed

    /** Prevents retrieving credentials silently */
    preventSilentAccess(): Promise<void>
  }

  interface Navigator {
    readonly credentials: CredentialsContainer
  }
}

// Adding this empty export makes this file a module, ensuring declarations are applied globally.
// However, for pure global augmentations, it might not be strictly necessary and sometimes omitted.
// If you encounter issues with types not being recognized, try adding/removing this line.
export {}
