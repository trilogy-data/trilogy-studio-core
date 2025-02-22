// Type definition for better type safety
interface DatabaseCredential {
    label: string;
    value: string;
}

/**
 * Stores database credentials securely in the browser, falling back to localStorage if 
 * Credential Management API is not available
 * @param label Unique identifier for the credential
 * @param value The database connection string or credential value to store
 * @returns Promise<boolean> indicating if storage was successful
 */
export async function storeDatabaseCredential(label: string, value: string): Promise<boolean> {
    // Check if the Credential Management API and PasswordCredential are fully supported
    if (!('credentials' in navigator) || typeof window.PasswordCredential === 'undefined') {
        console.warn('Credential Management API not fully supported, falling back to localStorage');
        try {
            localStorage.setItem(
                `db_credential_${label}`,
                JSON.stringify({ label, value })
            );
            return true;
        } catch (error) {
            console.error('Error storing in localStorage:', error);
            return false;
        }
    }

    try {
        const credential = new window.PasswordCredential({
            id: label,
            password: value,
            name: `Database Credential: ${label}`,
        });

        await navigator.credentials.store(credential);
        console.log('Credential stored successfully');
        return true;
    } catch (error) {
        console.error('Error storing credential:', error);
        // Fallback to localStorage if credential storage fails
        try {
            localStorage.setItem(
                `db_credential_${label}`,
                JSON.stringify({ label, value })
            );
            console.log('Fell back to localStorage storage');
            return true;
        } catch (fallbackError) {
            console.error('Error storing in localStorage:', fallbackError);
            return false;
        }
    }
}

/**
 * Retrieves stored database credentials from the browser
 * @param label The unique identifier for the credential to retrieve
 * @returns Promise<DatabaseCredential | null> The stored credential or null if not found
 */
export async function getDatabaseCredential(label: string): Promise<DatabaseCredential | null> {
    // Check if the Credential Management API and PasswordCredential are fully supported
    if (!('credentials' in navigator) || typeof window.PasswordCredential === 'undefined') {
        console.warn('Credential Management API not fully supported, falling back to localStorage');
        try {
            const stored = localStorage.getItem(`db_credential_${label}`);
            return stored ? JSON.parse(stored) : null;
        } catch (error) {
            console.error('Error retrieving from localStorage:', error);
            return null;
        }
    }

    try {
        const credential = await navigator.credentials.get({
            password: true,
            mediation: 'optional',
            id: label
        });

        if (credential instanceof PasswordCredential) {
            return {
                label: credential.id,
                value: credential.password || ''
            };
        }

        // If no credential found, try localStorage as fallback
        const stored = localStorage.getItem(`db_credential_${label}`);
        return stored ? JSON.parse(stored) : null;

    } catch (error) {
        console.error('Error retrieving credential:', error);
        // Try localStorage as fallback
        try {
            const stored = localStorage.getItem(`db_credential_${label}`);
            return stored ? JSON.parse(stored) : null;
        } catch (fallbackError) {
            console.error('Error retrieving from localStorage:', fallbackError);
            return null;
        }
    }
}