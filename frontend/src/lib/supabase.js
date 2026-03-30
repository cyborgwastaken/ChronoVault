import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Get the current Supabase session access token.
 * This token is a JWT signed by Supabase and auto-refreshed by the client.
 * @returns {Promise<string|null>} The access token or null if not authenticated
 */
export async function getAuthToken() {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session) {
        console.warn('[Auth] No active session:', error?.message);
        return null;
    }
    return session.access_token;
}

/**
 * Authenticated fetch wrapper that automatically injects the Supabase
 * session JWT as a Bearer token in the Authorization header.
 * 
 * @param {string} url - The URL to fetch
 * @param {RequestInit} [options={}] - Standard fetch options
 * @returns {Promise<Response>} The fetch response
 * @throws {Error} If no valid session exists
 */
export async function authFetch(url, options = {}) {
    const token = await getAuthToken();
    if (!token) {
        throw new Error('Not authenticated. Please sign in to continue.');
    }

    // Merge authorization header with any existing headers
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);

    // Don't set Content-Type for FormData — browser sets it with boundary
    return fetch(url, {
        ...options,
        headers,
    });
}
