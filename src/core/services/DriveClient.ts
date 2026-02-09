/**
 * DriveClient - Google Drive API Wrapper for appDataFolder
 * 
 * Handles all interactions with Google Drive's hidden app folder.
 * Uses multipart/related upload for efficient file operations.
 */

import * as z from "zod";
import {
    type CloudBackup,
    CloudBackupSchema,
    createEmptyBackup
} from "../types/storage.types";
import { AuthService, type AuthResult, type AuthError } from "./AuthService";

// ============================================================================
// Constants
// ============================================================================

const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const BACKUP_FILENAME = "backup_v1.json";
const MIME_TYPE = "application/json";

// ============================================================================
// Types
// ============================================================================

const DriveFileMetadataSchema = z.object({
    id: z.string(),
    name: z.string(),
    mimeType: z.string().optional(),
    modifiedTime: z.string().optional(),
    size: z.string().optional(),
});

type DriveFileMetadata = z.infer<typeof DriveFileMetadataSchema>;

const DriveFilesListSchema = z.object({
    files: z.array(DriveFileMetadataSchema),
    nextPageToken: z.string().optional(),
});

export type DriveResult<T> =
    | { success: true; data: T }
    | { success: false; error: DriveError };

export interface DriveError {
    code: "AUTH_FAILED" | "NOT_FOUND" | "RATE_LIMITED" | "NETWORK" | "PARSE_ERROR" | "UNKNOWN";
    message: string;
    status?: number;
    retryAfter?: number;
}

// ============================================================================
// DriveClient Class
// ============================================================================

export class DriveClient {
    private authService: AuthService;
    private cachedFileId: string | null = null;
    private static instance: DriveClient | null = null;

    private constructor() {
        this.authService = AuthService.getInstance();
    }

    /**
     * Singleton accessor
     */
    static getInstance(): DriveClient {
        if (!DriveClient.instance) {
            DriveClient.instance = new DriveClient();
        }
        return DriveClient.instance;
    }

    /**
     * Initialize - ensure auth is ready
     */
    async init(): Promise<DriveResult<void>> {
        await this.authService.init();

        // Try to get a token (non-interactive) to check auth status
        const tokenResult = await this.authService.getToken(false);

        if (!tokenResult.success) {
            // Not logged in yet - this is OK, sync will prompt when needed
            console.log("DriveClient: Not authenticated yet, sync will require login");
            return { success: true, data: undefined };
        }

        console.log("DriveClient: Initialized and authenticated");
        return { success: true, data: undefined };
    }

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Pull the backup file from Google Drive
     * Returns the parsed CloudBackup or an empty backup if file doesn't exist
     */
    async pull(): Promise<DriveResult<CloudBackup>> {
        // Get auth token
        const tokenResult = await this.authService.getToken(true);
        if (!tokenResult.success) {
            return this.authErrorToDriverError(tokenResult.error);
        }

        // Find the backup file
        const fileIdResult = await this.findBackupFile(tokenResult.data);
        if (!fileIdResult.success) {
            if (fileIdResult.error.code === "NOT_FOUND") {
                // No backup exists yet - return empty backup
                console.log("DriveClient: No backup file found, returning empty backup");
                return { success: true, data: createEmptyBackup() };
            }
            return fileIdResult;
        }

        // Download the file content
        const contentResult = await this.downloadFile(
            fileIdResult.data,
            tokenResult.data
        );
        if (!contentResult.success) {
            return contentResult;
        }

        // Parse and validate
        const parsed = CloudBackupSchema.safeParse(contentResult.data);
        if (!parsed.success) {
            console.error("DriveClient: Backup parse error", parsed.error);
            return {
                success: false,
                error: {
                    code: "PARSE_ERROR",
                    message: `Invalid backup format: ${parsed.error.message}`,
                },
            };
        }

        console.log("DriveClient: Successfully pulled backup with",
            parsed.data.conversations.length, "conversations");

        return { success: true, data: parsed.data };
    }

    /**
     * Push a backup to Google Drive
     * Creates the file if it doesn't exist, otherwise updates it
     */
    async push(backup: CloudBackup): Promise<DriveResult<void>> {
        // Validate backup before upload
        const validated = CloudBackupSchema.safeParse(backup);
        if (!validated.success) {
            return {
                success: false,
                error: {
                    code: "PARSE_ERROR",
                    message: `Invalid backup data: ${validated.error.message}`,
                },
            };
        }

        // Update timestamp
        backup.lastBackupAt = Date.now();
        backup.metadata.totalMessages = backup.conversations.reduce(
            (sum, conv) => sum + conv.messages.length, 0
        );

        // Get auth token
        const tokenResult = await this.authService.getToken(true);
        if (!tokenResult.success) {
            return this.authErrorToDriverError(tokenResult.error);
        }

        // Check if file exists
        const fileIdResult = await this.findBackupFile(tokenResult.data);

        if (fileIdResult.success) {
            // Update existing file
            return this.updateFile(fileIdResult.data, backup, tokenResult.data);
        } else if (fileIdResult.error.code === "NOT_FOUND") {
            // Create new file
            return this.createFile(backup, tokenResult.data);
        } else {
            return fileIdResult;
        }
    }

    /**
     * Check if user is authenticated for Drive access
     */
    async isAuthenticated(): Promise<boolean> {
        return this.authService.isLoggedIn();
    }

    /**
     * Trigger login flow
     */
    async login(): Promise<DriveResult<void>> {
        const result = await this.authService.login();
        if (result.success) {
            return { success: true, data: undefined };
        }
        return this.authErrorToDriverError(result.error);
    }

    /**
     * Logout and revoke access
     */
    async logout(): Promise<void> {
        await this.authService.logout();
        this.cachedFileId = null;
    }

    // ========================================================================
    // Private Methods - File Operations
    // ========================================================================

    private async findBackupFile(token: string): Promise<DriveResult<string>> {
        // Use cached file ID if available
        if (this.cachedFileId) {
            return { success: true, data: this.cachedFileId };
        }

        try {
            const response = await fetch(
                `${DRIVE_API_BASE}/files?` + new URLSearchParams({
                    spaces: "appDataFolder",
                    q: `name='${BACKUP_FILENAME}'`,
                    fields: "files(id, name, modifiedTime)",
                }),
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const errorResult = await this.handleApiResponse(response);
            if (errorResult) return errorResult;

            const data = await response.json();
            const parsed = DriveFilesListSchema.safeParse(data);

            if (!parsed.success) {
                return {
                    success: false,
                    error: {
                        code: "PARSE_ERROR",
                        message: "Failed to parse Drive files list",
                    },
                };
            }

            if (parsed.data.files.length === 0) {
                return {
                    success: false,
                    error: {
                        code: "NOT_FOUND",
                        message: "Backup file not found",
                    },
                };
            }

            // Cache the file ID
            const firstFile = parsed.data.files[0];
            if (!firstFile) {
                return {
                    success: false,
                    error: {
                        code: "NOT_FOUND",
                        message: "Backup file not found",
                    },
                };
            }
            this.cachedFileId = firstFile.id;
            return { success: true, data: this.cachedFileId };
        } catch (error) {
            return this.handleNetworkError(error);
        }
    }

    private async downloadFile(
        fileId: string,
        token: string
    ): Promise<DriveResult<unknown>> {
        try {
            const response = await fetch(
                `${DRIVE_API_BASE}/files/${fileId}?alt=media`,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                }
            );

            const errorResult = await this.handleApiResponse(response);
            if (errorResult) return errorResult;

            const data = await response.json();
            return { success: true, data };
        } catch (error) {
            return this.handleNetworkError(error);
        }
    }

    private async createFile(
        backup: CloudBackup,
        token: string
    ): Promise<DriveResult<void>> {
        const metadata = {
            name: BACKUP_FILENAME,
            parents: ["appDataFolder"],
            mimeType: MIME_TYPE,
        };

        const body = this.buildMultipartBody(metadata, backup);

        try {
            const response = await fetch(
                `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": `multipart/related; boundary=${body.boundary}`,
                    },
                    body: body.data,
                }
            );

            const errorResult = await this.handleApiResponse(response);
            if (errorResult) return errorResult;

            const data = await response.json();
            this.cachedFileId = data.id;

            console.log("DriveClient: Created backup file", this.cachedFileId);
            return { success: true, data: undefined };
        } catch (error) {
            return this.handleNetworkError(error);
        }
    }

    private async updateFile(
        fileId: string,
        backup: CloudBackup,
        token: string
    ): Promise<DriveResult<void>> {
        const body = this.buildMultipartBody({}, backup);

        try {
            const response = await fetch(
                `${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=multipart`,
                {
                    method: "PATCH",
                    headers: {
                        Authorization: `Bearer ${token}`,
                        "Content-Type": `multipart/related; boundary=${body.boundary}`,
                    },
                    body: body.data,
                }
            );

            const errorResult = await this.handleApiResponse(response);
            if (errorResult) return errorResult;

            console.log("DriveClient: Updated backup file");
            return { success: true, data: undefined };
        } catch (error) {
            return this.handleNetworkError(error);
        }
    }

    // ========================================================================
    // Private Methods - Helpers
    // ========================================================================

    private buildMultipartBody(
        metadata: Record<string, unknown>,
        content: CloudBackup
    ): { boundary: string; data: string } {
        const boundary = `boundary_${Date.now()}_${Math.random().toString(36)}`;

        const data = [
            `--${boundary}`,
            "Content-Type: application/json; charset=UTF-8",
            "",
            JSON.stringify(metadata),
            `--${boundary}`,
            `Content-Type: ${MIME_TYPE}`,
            "",
            JSON.stringify(content),
            `--${boundary}--`,
        ].join("\r\n");

        return { boundary, data };
    }

    private async handleApiResponse(
        response: Response
    ): Promise<DriveResult<never> | null> {
        if (response.ok) {
            return null; // No error
        }

        if (response.status === 401) {
            // Token expired - try to refresh
            const refreshResult = await this.authService.refreshToken();
            if (!refreshResult.success) {
                return {
                    success: false,
                    error: {
                        code: "AUTH_FAILED",
                        message: "Authentication failed. Please login again.",
                        status: 401,
                    },
                };
            }
            // Caller should retry with new token
            return {
                success: false,
                error: {
                    code: "AUTH_FAILED",
                    message: "Token refreshed, please retry.",
                    status: 401,
                },
            };
        }

        if (response.status === 403) {
            return {
                success: false,
                error: {
                    code: "AUTH_FAILED",
                    message: "Access denied. Please check permissions.",
                    status: 403,
                },
            };
        }

        if (response.status === 429) {
            const retryAfter = parseInt(
                response.headers.get("Retry-After") || "60",
                10
            );
            return {
                success: false,
                error: {
                    code: "RATE_LIMITED",
                    message: "Rate limited by Google. Please wait.",
                    status: 429,
                    retryAfter,
                },
            };
        }

        if (response.status === 404) {
            return {
                success: false,
                error: {
                    code: "NOT_FOUND",
                    message: "File not found",
                    status: 404,
                },
            };
        }

        return {
            success: false,
            error: {
                code: "UNKNOWN",
                message: `API error: ${response.status} ${response.statusText}`,
                status: response.status,
            },
        };
    }

    private handleNetworkError(error: unknown): DriveResult<never> {
        const message = error instanceof Error ? error.message : String(error);
        return {
            success: false,
            error: {
                code: "NETWORK",
                message: `Network error: ${message}`,
            },
        };
    }

    private authErrorToDriverError(authError: AuthError): DriveResult<never> {
        return {
            success: false,
            error: {
                code: "AUTH_FAILED",
                message: authError.message,
            },
        };
    }
}

// Export singleton instance getter
export const getDriveClient = DriveClient.getInstance;
