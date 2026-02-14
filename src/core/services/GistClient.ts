/**
 * GistClient - GitHub Gist API Wrapper
 * 
 * Handles synchronization with GitHub Gist.
 * Replaces Google Drive as the storage backend.
 */

import * as z from "zod";
import {
    type CloudBackup,
    CloudBackupSchema,
    createEmptyBackup
} from "../types/storage.types";

// ============================================================================
// Constants
// ============================================================================

const GITHUB_API_BASE = "https://api.github.com";
const BACKUP_FILENAME = "gemini-council-backup.json";
const GIST_DESCRIPTION = "Gemini Council Backup";
const TOKEN_STORAGE_KEY = "council_github_token";

// ============================================================================
// Types
// ============================================================================

const GistFileSchema = z.object({
    filename: z.string(),
    content: z.string(),
    raw_url: z.string(),
});

const GistSchema = z.object({
    id: z.string(),
    description: z.string().nullable(),
    files: z.record(z.string(), GistFileSchema),
    updated_at: z.string(),
});

type Gist = z.infer<typeof GistSchema>;

export type GistResult<T> =
    | { success: true; data: T }
    | { success: false; error: GistError };

export interface GistError {
    code: "AUTH_FAILED" | "NOT_FOUND" | "RATE_LIMITED" | "NETWORK" | "PARSE_ERROR" | "UNKNOWN" | "CONFIG_MISSING";
    message: string;
}

// ============================================================================
// GistClient Class
// ============================================================================

export class GistClient {
    private token: string | null = null;
    private savedGistId: string | null = null;
    private static instance: GistClient | null = null;

    private constructor() { }

    /**
     * Singleton accessor
     */
    static getInstance(): GistClient {
        if (!GistClient.instance) {
            GistClient.instance = new GistClient();
        }
        return GistClient.instance;
    }

    /**
     * Initialize - load saved token
     */
    async init(): Promise<void> {
        try {
            const stored = await chrome.storage.local.get(TOKEN_STORAGE_KEY);
            if (typeof stored[TOKEN_STORAGE_KEY] === "string") {
                this.token = stored[TOKEN_STORAGE_KEY];
                console.log("GistClient: Loaded saved token");
            }
        } catch (e) {
            console.warn("GistClient: Failed to load token", e);
        }
    }

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Set the GitHub Personal Access Token
     *Verifies the token by fetching the user profile
     */
    async login(token: string): Promise<GistResult<boolean>> {
        if (!token) {
            return {
                success: false,
                error: { code: "AUTH_FAILED", message: "Token is empty" }
            };
        }

        // Verify token by fetching user
        try {
            const response = await fetch(`${GITHUB_API_BASE}/user`, {
                headers: {
                    "Authorization": `token ${token}`,
                    "Accept": "application/vnd.github.v3+json"
                }
            });

            if (!response.ok) {
                return {
                    success: false,
                    error: {
                        code: "AUTH_FAILED",
                        message: `Invalid token: ${response.statusText}`
                    }
                };
            }

            // Save token
            this.token = token;
            await chrome.storage.local.set({ [TOKEN_STORAGE_KEY]: token });
            this.savedGistId = null; // Reset cache

            console.log("GistClient: Logged in successfully");
            return { success: true, data: true };
        } catch (error) {
            return this.handleNetworkError(error);
        }
    }

    /**
     * Clear the token
     */
    async logout(): Promise<void> {
        this.token = null;
        this.savedGistId = null;
        await chrome.storage.local.remove(TOKEN_STORAGE_KEY);
        console.log("GistClient: Logged out");
    }

    /**
     * Check if properly authenticated
     */
    isAuthenticated(): boolean {
        return !!this.token;
    }

    /**
     * Pull backup from Gist
     */
    async pull(): Promise<GistResult<CloudBackup>> {
        if (!this.token) {
            return {
                success: false,
                error: { code: "CONFIG_MISSING", message: "GitHub Token not set" }
            };
        }

        const gistResult = await this.findBackupGist();
        if (!gistResult.success) {
            if (gistResult.error.code === "NOT_FOUND") {
                return { success: true, data: createEmptyBackup() };
            }
            return gistResult;
        }

        const gist = gistResult.data;
        const file = gist.files[BACKUP_FILENAME];

        if (!file) {
            // Gist exists but file is missing (weird?), return empty
            return { success: true, data: createEmptyBackup() };
        }

        // Fetch raw content if truncated (though typically it's included for small files)
        // For safety, let's fetch raw_url if content is missing or truncated?
        // Actually, 'content' in get-gist API might be truncated if large.
        // It's safer to fetch the raw_url.
        try {
            const rawResponse = await fetch(file.raw_url);
            if (!rawResponse.ok) throw new Error("Failed to fetch raw content");
            const rawJson = await rawResponse.json();

            const parsed = CloudBackupSchema.safeParse(rawJson);
            if (!parsed.success) {
                return {
                    success: false,
                    error: {
                        code: "PARSE_ERROR",
                        message: `Invalid backup format: ${parsed.error.message}`
                    }
                };
            }

            console.log("GistClient: Pulled backup, conversation count:", parsed.data.conversations.length);
            return { success: true, data: parsed.data };

        } catch (error) {
            return this.handleNetworkError(error);
        }
    }

    /**
     * Push backup to Gist
     */
    async push(backup: CloudBackup): Promise<GistResult<void>> {
        if (!this.token) {
            return {
                success: false,
                error: { code: "CONFIG_MISSING", message: "GitHub Token not set" }
            };
        }

        // Validate backup
        const validated = CloudBackupSchema.safeParse(backup);
        if (!validated.success) {
            return {
                success: false,
                error: {
                    code: "PARSE_ERROR",
                    message: `Invalid backup data: ${validated.error.message}`
                }
            };
        }

        // Update timestamps
        backup.lastBackupAt = Date.now();
        backup.metadata.totalMessages = backup.conversations.reduce(
            (sum, conv) => sum + conv.messages.length, 0
        );

        const gistResult = await this.findBackupGist();

        const filesPayload = {
            [BACKUP_FILENAME]: {
                content: JSON.stringify(backup, null, 2)
            }
        };

        try {
            if (gistResult.success) {
                // Update existing
                await this.updateGist(gistResult.data.id, filesPayload);
            } else if (gistResult.error.code === "NOT_FOUND") {
                // Create new
                await this.createGist(filesPayload);
            } else {
                return { success: false, error: gistResult.error };
            }

            return { success: true, data: undefined };
        } catch (error) {
            return this.handleNetworkError(error);
        }
    }

    // ========================================================================
    // Private Helpers
    // ========================================================================

    private async findBackupGist(): Promise<GistResult<Gist>> {
        if (this.savedGistId) {
            const gist = await this.getGist(this.savedGistId);
            if (gist) return { success: true, data: gist };
            this.savedGistId = null; // Invalid cache
        }

        try {
            // Retrieve authenticated user's gists
            // Note: per_page=100 to catch it if user has many
            const response = await fetch(`${GITHUB_API_BASE}/gists`, {
                headers: this.getHeaders()
            });

            if (!response.ok) return this.handleApiResponse(response);

            const gists: Gist[] = await response.json();

            // Look for our specific backup gist
            // We match by Description OR Filename
            const target = gists.find(g =>
                g.description === GIST_DESCRIPTION ||
                (g.files && g.files[BACKUP_FILENAME])
            );

            if (target) {
                this.savedGistId = target.id;
                return { success: true, data: target };
            }

            return {
                success: false,
                error: { code: "NOT_FOUND", message: "Backup gist not found" }
            };

        } catch (error) {
            return this.handleNetworkError(error);
        }
    }

    private async getGist(id: string): Promise<Gist | null> {
        try {
            const response = await fetch(`${GITHUB_API_BASE}/gists/${id}`, {
                headers: this.getHeaders()
            });
            if (response.ok) return await response.json();
            return null;
        } catch {
            return null;
        }
    }

    private async createGist(files: Record<string, { content: string }>): Promise<GistResult<void>> {
        try {
            const response = await fetch(`${GITHUB_API_BASE}/gists`, {
                method: "POST",
                headers: this.getHeaders(),
                body: JSON.stringify({
                    description: GIST_DESCRIPTION,
                    public: false, // Secret Gist
                    files
                })
            });

            if (!response.ok) return this.handleApiResponse(response);

            const data = await response.json();
            this.savedGistId = data.id;
            console.log("GistClient: Created new backup Gist", data.id);

            return { success: true, data: undefined };
        } catch (error) {
            return this.handleNetworkError(error);
        }
    }

    private async updateGist(id: string, files: Record<string, { content: string }>): Promise<GistResult<void>> {
        try {
            const response = await fetch(`${GITHUB_API_BASE}/gists/${id}`, {
                method: "PATCH",
                headers: this.getHeaders(),
                body: JSON.stringify({ files })
            });

            if (!response.ok) return this.handleApiResponse(response);

            console.log("GistClient: Updated backup Gist", id);
            return { success: true, data: undefined };
        } catch (error) {
            return this.handleNetworkError(error);
        }
    }

    private getHeaders(): HeadersInit {
        return {
            "Authorization": `token ${this.token}`,
            "Accept": "application/vnd.github.v3+json",
            "Content-Type": "application/json"
        };
    }

    private handleApiResponse(response: Response): GistResult<any> {
        if (response.status === 401) {
            return {
                success: false,
                error: { code: "AUTH_FAILED", message: "Invalid GitHub Token" }
            };
        }
        if (response.status === 403 || response.status === 429) {
            return {
                success: false,
                error: { code: "RATE_LIMITED", message: "GitHub API Rate Limit Exceeded" }
            };
        }
        return {
            success: false,
            error: {
                code: "UNKNOWN",
                message: `GitHub API Error: ${response.status} ${response.statusText}`
            }
        };
    }

    private handleNetworkError(error: unknown): GistResult<never> {
        const message = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            error: {
                code: "NETWORK",
                message: `Network error: ${message}`,
            },
        };
    }
}

export const getGistClient = GistClient.getInstance;
