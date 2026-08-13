/**
 * Host Authentication Utility
 * Manages host codes for simple authentication
 */

const HOST_CODE_KEY = 'luma_host_code';

/**
 * Generate a random host code (6 characters: letters + numbers)
 */
export function generateHostCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude confusing characters
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Get the current host code from localStorage
 */
export function getHostCode(): string | null {
  return localStorage.getItem(HOST_CODE_KEY);
}

/**
 * Save host code to localStorage
 */
export function saveHostCode(code: string): void {
  localStorage.setItem(HOST_CODE_KEY, code.toUpperCase());
}

/**
 * Remove host code from localStorage (logout)
 */
export function clearHostCode(): void {
  localStorage.removeItem(HOST_CODE_KEY);
}

/**
 * Check if a host is logged in
 */
export function isHostLoggedIn(): boolean {
  return getHostCode() !== null;
}
