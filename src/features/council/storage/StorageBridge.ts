/**
 * StorageBridge - Content Script Interface to Storage
 * 
 * Provides a clean API for content scripts to persist and retrieve messages.
 * All operations go through chrome.runtime.sendMessage to the background script.
 */

import type {
    ExternalMessage,
    MessageAnchor,
    StoredConversation,
    SyncState,
} from "../../../core/types/storage.types";
import {
    createExternalMessage,
    hashMessageContent
} from "../../../core/types/storage.types";

// ============================================================================
// Types
// ============================================================================

interface StorageResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}

interface SyncStatusResponse {
    success: boolean;
    state?: SyncState;
    isLoggedIn?: boolean;
    error?: string;
}

// ============================================================================
// StorageBridge Class
// ============================================================================

export class StorageBridge {
    /**
     * Extract conversation ID from the current URL
     */
    static getConversationId(): string | null {
        const url = window.location.href;

        // Pattern: https://gemini.google.com/app/{conversation_id}
        const match = url.match(/gemini\.google\.com\/app\/([a-zA-Z0-9_-]+)/);

        if (match && match[1]) {
            return match[1];
        }

        // Fallback: use a hash of the URL path
        const path = new URL(url).pathname;
        if (path && path !== "/") {
            return hashMessageContent(path);
        }

        return null;
    }

    /**
     * Extract conversation title from the page
     */
    static getConversationTitle(): string | undefined {
        // Try to find the title from the page
        const titleElement = document.querySelector('h1') ||
            document.querySelector('[role="heading"]');

        if (titleElement && titleElement.textContent) {
            const title = titleElement.textContent.trim();
            if (title && title.length > 0 && title.length < 200) {
                return title;
            }
        }

        return undefined;
    }

    /**
     * Create an anchor from the current DOM state
     * The anchor helps re-position injected messages after page refresh
     */
    static createAnchor(precedingElement: Element | null, positionIndex: number): MessageAnchor {
        if (!precedingElement) {
            return {
                precedingMessageHash: "",
                positionIndex,
                precedingMessageSnippet: "",
            };
        }

        const content = precedingElement.textContent || "";
        const snippet = content.slice(0, 200).trim();

        return {
            precedingMessageHash: hashMessageContent(content),
            positionIndex,
            precedingMessageSnippet: snippet,
        };
    }

    /**
     * Save a new external message to storage
     */
    static async saveMessage(
        params: {
            modelId: string;
            modelName: string;
            userPrompt: string;
            content: string;
            contextAttached?: boolean;
        },
        anchor: MessageAnchor,
        conversationId?: string,
        conversationTitle?: string
    ): Promise<StorageResponse<ExternalMessage>> {
        const convId = conversationId || this.getConversationId();

        if (!convId) {
            return {
                success: false,
                error: "Could not determine conversation ID",
            };
        }

        const message = createExternalMessage({
            modelId: params.modelId,
            modelName: params.modelName,
            userPrompt: params.userPrompt,
            content: params.content,
            contextAttached: params.contextAttached,
        });

        const title = conversationTitle || this.getConversationTitle();

        try {
            const response = await chrome.runtime.sendMessage({
                type: "SAVE_MESSAGE",
                payload: {
                    conversationId: convId,
                    message,
                    anchor,
                    conversationTitle: title,
                },
            });

            if (response.success) {
                return { success: true, data: message };
            }

            return {
                success: false,
                error: response.error || "Unknown error"
            };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("StorageBridge: Save error", errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Get all messages for a conversation
     */
    static async getMessages(
        conversationId?: string
    ): Promise<StorageResponse<ExternalMessage[]>> {
        const convId = conversationId || this.getConversationId();

        if (!convId) {
            return { success: true, data: [] };
        }

        try {
            const response = await chrome.runtime.sendMessage({
                type: "GET_MESSAGES",
                payload: { conversationId: convId },
            });

            if (response.success) {
                return { success: true, data: response.data || [] };
            }

            return {
                success: false,
                error: response.error || "Unknown error"
            };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("StorageBridge: Get messages error", errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Get full conversation data including anchors
     */
    static async getConversation(
        conversationId?: string
    ): Promise<StorageResponse<StoredConversation | null>> {
        const convId = conversationId || this.getConversationId();

        if (!convId) {
            return { success: true, data: null };
        }

        try {
            const response = await chrome.runtime.sendMessage({
                type: "GET_CONVERSATION",
                payload: { conversationId: convId },
            });

            if (response.success) {
                return { success: true, data: response.data || null };
            }

            return {
                success: false,
                error: response.error || "Unknown error"
            };
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error("StorageBridge: Get conversation error", errorMessage);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Trigger an immediate sync
     */
    static async syncNow(): Promise<SyncStatusResponse> {
        try {
            const response = await chrome.runtime.sendMessage({
                type: "SYNC_NOW",
            });

            return response;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Get current sync status
     */
    static async getSyncStatus(): Promise<SyncStatusResponse> {
        try {
            const response = await chrome.runtime.sendMessage({
                type: "SYNC_STATUS",
            });

            return response;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Login to sync
     */
    static async login(): Promise<SyncStatusResponse> {
        try {
            const response = await chrome.runtime.sendMessage({
                type: "SYNC_LOGIN",
            });

            return response;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { success: false, error: errorMessage };
        }
    }

    /**
     * Logout from sync
     */
    static async logout(): Promise<StorageResponse<void>> {
        try {
            const response = await chrome.runtime.sendMessage({
                type: "SYNC_LOGOUT",
            });

            return response;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            return { success: false, error: errorMessage };
        }
    }
}
