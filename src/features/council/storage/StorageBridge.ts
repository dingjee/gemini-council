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
        // First priority: Read from the active sidebar item.
        // Google sometimes redirects to a short Base62 URL (e.g. /app/ldybj7),
        // but preserves the original 16-char hex ID in the sidebar href.
        // We MUST use the original ID to match our stored Gist data.
        const activeSidebarItem = document.querySelector('a.conversation.selected[aria-current="true"]');
        if (activeSidebarItem) {
            const href = activeSidebarItem.getAttribute('href');
            if (href) {
                const match = href.match(/\/app\/([a-zA-Z0-9_-]+)/);
                if (match && match[1]) {
                    console.log(`StorageBridge: Got conversation ID "${match[1]}" from sidebar`);
                    return match[1];
                }
            }
        }

        const url = window.location.href;

        // Pattern: https://gemini.google.com/app/{conversation_id}
        const match = url.match(/gemini\.google\.com\/app\/([a-zA-Z0-9_-]+)/);

        if (match && match[1]) {
            console.log(`StorageBridge: Got conversation ID "${match[1]}" from URL`);
            return match[1];
        }

        // Fallback: use a hash of the URL path
        const path = new URL(url).pathname;
        if (path && path !== "/") {
            const hashId = hashMessageContent(path);
            console.log(`StorageBridge: Got conversation ID "${hashId}" from path hash`);
            return hashId;
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
     * The anchor helps re-position injected messages after page refresh.
     * Uses a three-layer strategy for cross-device reliability:
     *   1. geminiMessageId — Gemini's native conversation-container ID
     *   2. precedingMessageHash — hash of stable body text only (no UI chrome)
     *   3. positionIndex — child index fallback
     */
    static createAnchor(precedingElement: Element | null, positionIndex: number): MessageAnchor {
        if (!precedingElement) {
            return {
                precedingMessageHash: "",
                positionIndex,
                precedingMessageSnippet: "",
                geminiMessageId: "",
            };
        }

        const content = StorageBridge.extractStableContent(precedingElement);
        const snippet = content.slice(0, 200).trim();

        // Extract Gemini's native conversation-container ID (server-generated, cross-device stable)
        const container = precedingElement.closest('.conversation-container');
        const geminiMessageId = container?.id || precedingElement.id || "";

        return {
            precedingMessageHash: hashMessageContent(content),
            positionIndex,
            precedingMessageSnippet: snippet,
            geminiMessageId,
        };
    }

    /**
     * Extract only the stable message body text from a DOM element,
     * excluding locale-dependent UI chrome (buttons, aria-labels, tooltips, etc.)
     * This ensures consistent hashing across devices with different languages/locales.
     */
    static extractStableContent(element: Element): string {
        // For user queries, extract only the query text lines
        const queryText = element.querySelector('.query-text');
        if (queryText) {
            const lines = queryText.querySelectorAll('.query-text-line');
            if (lines.length > 0) {
                return Array.from(lines).map(l => l.textContent?.trim() || '').join('\n');
            }
            return queryText.textContent?.trim() || '';
        }

        // For model responses, extract only the markdown content
        const markdown = element.querySelector('.markdown');
        if (markdown) {
            return markdown.textContent?.trim() || '';
        }

        // For combined conversation-containers, try to extract both parts
        const parts: string[] = [];
        const userQ = element.querySelector('user-query-content .query-text');
        if (userQ) parts.push(userQ.textContent?.trim() || '');

        const modelR = element.querySelector('message-content .markdown');
        if (modelR) parts.push(modelR.textContent?.trim() || '');

        if (parts.length > 0) return parts.join('\n');

        // Final fallback: raw textContent (may not match across devices)
        return element.textContent || '';
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
     * Login to sync (GitHub Token)
     */
    static async login(token?: string): Promise<SyncStatusResponse> {
        try {
            const response = await chrome.runtime.sendMessage({
                type: "SYNC_LOGIN",
                payload: { token: token }
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
