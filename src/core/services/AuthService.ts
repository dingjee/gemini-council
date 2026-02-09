/**
 * AuthService - Google OAuth Token Management
 * 
 * Handles authentication with Google Drive API using chrome.identity.
 * Manages token lifecycle including refresh and error handling.
 */

import { z } from "zod";

// ============================================================================
// Types
// ============================================================================

const TokenInfoSchema = z.object({
    token: z.string(),
    expiresAt: z.number(),
});

type TokenInfo = z.infer<typeof TokenInfoSchema>;

export interface AuthError {
    code: "NO_TOKEN" | "EXPIRED" | "REVOKED" | "NETWORK" | "UNKNOWN";
    message: string;
}

export type AuthResult<T> =
    | { success: true; data: T }
    | { success: false; error: AuthError };

// ============================================================================
// Constants
// ============================================================================

// Google Drive appDataFolder scope - only accesses app-specific hidden folder
const SCOPES = ["https://www.googleapis.com/auth/drive.appdata"];

// Token refresh buffer (5 minutes before expiry)
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

// Storage key for cached token info
const TOKEN_STORAGE_KEY = "council_oauth_token";

// ============================================================================
// AuthService Class
// ============================================================================

export class AuthService {
    private cachedToken: TokenInfo | null = null;
    private static instance: AuthService | null = null;

    private constructor() { }

    /**
     * Singleton accessor
     */
    static getInstance(): AuthService {
        if (!AuthService.instance) {
            AuthService.instance = new AuthService();
        }
        return AuthService.instance;
    }

    /**
     * Initialize - load cached token from storage
     */
    async init(): Promise<void> {
        try {
            const stored = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
            if (stored[TOKEN_STORAGE_KEY]) {
                const parsed = TokenInfoSchema.safeParse(stored[TOKEN_STORAGE_KEY]);
                if (parsed.success) {
                    this.cachedToken = parsed.data;
                    console.log("AuthService: Loaded cached token");
                }
            }
        } catch (e) {
            console.warn("AuthService: Failed to load cached token", e);
        }
    }

    /**
     * Get a valid access token, refreshing if necessary
     * Interactive mode will prompt user for consent if needed
     */
    async getToken(interactive = false): Promise<AuthResult<string>> {
        // Check cached token validity
        if (this.cachedToken && this.isTokenValid(this.cachedToken)) {
            return { success: true, data: this.cachedToken.token };
        }

        // Need to get a new token
        try {
            const token = await this.requestToken(interactive);

            if (!token) {
                return {
                    success: false,
                    error: {
                        code: "NO_TOKEN",
                        message: interactive
                            ? "User denied access or popup was closed"
                            : "No valid token available. User authentication required.",
                    },
                };
            }

            // Cache the new token (Chrome tokens typically last 1 hour)
            this.cachedToken = {
                token,
                expiresAt: Date.now() + 55 * 60 * 1000, // 55 minutes to be safe
            };

            // Persist to storage
            await this.persistToken();

            return { success: true, data: token };
        } catch (error: unknown) {
            return this.handleAuthError(error);
        }
    }

    /**
     * Force refresh the token (useful after 401 errors)
     */
    async refreshToken(): Promise<AuthResult<string>> {
        // Clear cached token
        this.cachedToken = null;

        try {
            // Remove the cached token from Chrome's identity cache
            const currentToken = await this.requestToken(false);
            if (currentToken) {
                await chrome.identity.removeCachedAuthToken({ token: currentToken });
            }
        } catch {
            // Ignore errors during cache clear
        }

        // Get a fresh token
        return this.getToken(false);
    }

    /**
     * Check if user is logged in (has valid token)
     */
    async isLoggedIn(): Promise<boolean> {
        const result = await this.getToken(false);
        return result.success;
    }

    /**
     * Trigger interactive login flow
     */
    async login(): Promise<AuthResult<string>> {
        return this.getToken(true);
    }

    /**
     * Logout - revoke and clear tokens
     */
    async logout(): Promise<void> {
        if (this.cachedToken) {
            try {
                // Revoke the token with Google
                await fetch(
                    `https://accounts.google.com/o/oauth2/revoke?token=${this.cachedToken.token}`
                );

                // Remove from Chrome's cache
                await chrome.identity.removeCachedAuthToken({
                    token: this.cachedToken.token
                });
            } catch (e) {
                console.warn("AuthService: Error revoking token", e);
            }
        }

        // Clear local cache
        this.cachedToken = null;
        await chrome.storage.local.remove(TOKEN_STORAGE_KEY);

        console.log("AuthService: Logged out");
    }

    // ========================================================================
    // Private Methods
    // ========================================================================

    private isTokenValid(tokenInfo: TokenInfo): boolean {
        return tokenInfo.expiresAt > Date.now() + TOKEN_REFRESH_BUFFER_MS;
    }

    private async requestToken(interactive: boolean): Promise<string | null> {
        return new Promise((resolve) => {
            chrome.identity.getAuthToken(
                {
                    interactive,
                    scopes: SCOPES,
                },
                (token) => {
                    if (chrome.runtime.lastError) {
                        console.warn(
                            "AuthService: getAuthToken error:",
                            chrome.runtime.lastError.message
                        );
                        resolve(null);
                        return;
                    }
                    resolve(token ?? null);
                }
            );
        });
    }

    private async persistToken(): Promise<void> {
        if (this.cachedToken) {
            await chrome.storage.local.set({
                [TOKEN_STORAGE_KEY]: this.cachedToken,
            });
        }
    }

    private handleAuthError(error: unknown): AuthResult<never> {
        const errorMessage = error instanceof Error ? error.message : String(error);

        if (errorMessage.includes("revoked") || errorMessage.includes("invalid_grant")) {
            return {
                success: false,
                error: {
                    code: "REVOKED",
                    message: "Access was revoked. Please login again.",
                },
            };
        }

        if (errorMessage.includes("network") || errorMessage.includes("fetch")) {
            return {
                success: false,
                error: {
                    code: "NETWORK",
                    message: "Network error. Please check your connection.",
                },
            };
        }

        return {
            success: false,
            error: {
                code: "UNKNOWN",
                message: errorMessage,
            },
        };
    }
}

// Export singleton instance getter
export const getAuthService = AuthService.getInstance;
