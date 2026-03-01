/**
 * MessageHydrator - Restores Injected Messages After Page Refresh
 * 
 * On page load, this component:
 * 1. Retrieves stored messages for the current conversation
 * 2. Finds the correct anchor points in the DOM
 * 3. Re-injects the external model responses
 */

import { StorageBridge } from "../storage/StorageBridge";
import { MessageRenderer } from "../ui/MessageRenderer";
import type { ExternalMessage, MessageAnchor, StoredConversation } from "../../../core/types/storage.types";

// ============================================================================
// Constants
// ============================================================================

// Delay before attempting hydration (wait for Gemini to render)
const HYDRATION_DELAY_MS = 1500;

// Maximum retries for finding anchor elements
const MAX_ANCHOR_RETRIES = 5;
const ANCHOR_RETRY_DELAY_MS = 500;

// Maximum retries & delay for waiting for sync to bring Gist data into IndexedDB
const SYNC_READY_MAX_RETRIES = 6;
const SYNC_READY_RETRY_DELAY_MS = 2000;
const SYNC_READY_POLL_INTERVAL_MS = 1000;
const SYNC_READY_TIMEOUT_MS = 15000;

// ============================================================================
// MessageHydrator Class
// ============================================================================

export class MessageHydrator {
    private hydrated = false;
    private hydratedMessageIds = new Set<string>();

    /**
     * Start the hydration process
     * Should be called when the content script initializes.
     * 
     * On a new device, the Gist sync may still be in progress when this runs.
     * We wait for sync readiness before attempting to read from local storage.
     */
    async hydrate(): Promise<void> {
        if (this.hydrated) {
            console.log("MessageHydrator: Already hydrated, skipping");
            return;
        }

        // Wait for Gemini's UI to render
        await this.waitForChatContainer();

        // Wait for background sync to finish pulling Gist data into IndexedDB
        const syncInfo = await this.waitForSyncReady();

        console.log("MessageHydrator: Starting hydration...");

        // Attempt to get stored conversation, with retries for sync lag and DOM loading
        let conversation = null;
        let lastId = null;

        for (let attempt = 0; attempt < SYNC_READY_MAX_RETRIES; attempt++) {
            // Re-evaluate ID on each retry - the sidebar element might take a moment to render
            const conversationId = StorageBridge.getConversationId();
            lastId = conversationId;

            if (conversationId) {
                const result = await StorageBridge.getConversation(conversationId);

                if (result.success && result.data) {
                    conversation = result.data;
                    console.log(`MessageHydrator: [DIAG] Success on attempt ${attempt + 1} with ID="${conversationId}"`);
                    break;
                }
            }

            if (attempt < SYNC_READY_MAX_RETRIES - 1) {
                console.log(`MessageHydrator: No conversation found for ID="${conversationId}", retrying (${attempt + 1}/${SYNC_READY_MAX_RETRIES})...`);
                await this.sleep(SYNC_READY_RETRY_DELAY_MS);
            }
        }

        if (!conversation) {
            console.log(`MessageHydrator: No stored conversation found after retries (Last ID checked: "${lastId}")`);
            return;
        }

        console.log(`MessageHydrator: Found ${conversation.messages.length} stored messages`);

        // Inject each message
        for (const message of conversation.messages) {
            if (this.hydratedMessageIds.has(message.id)) {
                continue;
            }

            const anchor = conversation.anchors[message.id];
            await this.injectMessage(message, anchor);
            this.hydratedMessageIds.add(message.id);
        }

        this.hydrated = true;
        console.log("MessageHydrator: Hydration complete");
    }

    /**
     * Wait for the chat container to be present in the DOM
     */
    private async waitForChatContainer(): Promise<HTMLElement | null> {
        return new Promise((resolve) => {
            let attempts = 0;
            const maxAttempts = 20;

            const check = () => {
                const container = MessageRenderer.findChatContainer();

                if (container) {
                    resolve(container);
                    return;
                }

                attempts++;
                if (attempts >= maxAttempts) {
                    console.warn("MessageHydrator: Chat container not found after max attempts");
                    resolve(null);
                    return;
                }

                setTimeout(check, HYDRATION_DELAY_MS / 10);
            };

            // Initial delay before first check
            setTimeout(check, HYDRATION_DELAY_MS);
        });
    }

    /**
     * Wait for the background sync (Gist pull) to finish.
     * On a new device, the SyncManager.hydrate() in the background script
     * pulls data from Gist into IndexedDB. We need to wait for that to complete
     * before attempting to read from local storage.
     * 
     * Returns diagnostic info about sync state.
     */
    private async waitForSyncReady(): Promise<{ isLoggedIn: boolean; status: string }> {
        const startTime = Date.now();
        let lastInfo = { isLoggedIn: false, status: "unknown" };

        while (Date.now() - startTime < SYNC_READY_TIMEOUT_MS) {
            try {
                const status = await StorageBridge.getSyncStatus();

                if (status.success && status.state) {
                    const syncStatus = status.state.status;
                    lastInfo = { isLoggedIn: !!status.isLoggedIn, status: syncStatus };

                    // If sync is idle, error, or offline — it's done (or not going to happen)
                    if (syncStatus !== "syncing") {
                        console.log(`MessageHydrator: Sync ready (status: ${syncStatus}, loggedIn: ${status.isLoggedIn}, lastSync: ${status.state.lastSyncAt})`);
                        return lastInfo;
                    }

                    console.log("MessageHydrator: Waiting for sync to complete...");
                } else if (!status.isLoggedIn) {
                    // Not logged in — no sync will happen
                    console.log("MessageHydrator: Not logged in to sync, proceeding without sync data");
                    return { isLoggedIn: false, status: "no_auth" };
                }
            } catch {
                // Background script not ready yet, keep waiting
                console.log("MessageHydrator: Background not ready, retrying...");
            }

            await this.sleep(SYNC_READY_POLL_INTERVAL_MS);
        }

        console.warn("MessageHydrator: Sync readiness timeout, proceeding anyway");
        return lastInfo;
    }

    /**
     * Inject a single message into the DOM at the correct position
     * This now injects both the user message AND the model response
     */
    private async injectMessage(
        message: ExternalMessage,
        anchor: MessageAnchor | undefined
    ): Promise<void> {
        const chatContainer = MessageRenderer.findChatContainer();
        if (!chatContainer) {
            console.warn("MessageHydrator: No chat container for injection");
            return;
        }

        const anchorElement = anchor
            ? await this.findAnchorElement(chatContainer, anchor)
            : null;

        const container = document.createElement('div');
        container.className = 'council-hydrated-group';
        container.dataset.hydratedMessageId = message.id;

        const userMessage = MessageRenderer.createUserMessage(message.userPrompt, true);
        userMessage.classList.add('council-hydrated');
        container.appendChild(userMessage);

        const modelResponse = MessageRenderer.createModelResponse(
            message.modelId,
            message.modelName,
            message.content,
            message.userPrompt
        );
        modelResponse.dataset.hydratedMessageId = message.id;
        modelResponse.classList.add('council-hydrated');
        container.appendChild(modelResponse);

        if (anchorElement) {
            if (anchorElement.nextSibling) {
                chatContainer.insertBefore(container, anchorElement.nextSibling);
            } else {
                chatContainer.appendChild(container);
            }
        } else if (anchor && anchor.positionIndex >= 0) {
            const children = Array.from(chatContainer.children);
            const insertIndex = Math.min(anchor.positionIndex, children.length);

            const insertBeforeElement = children[insertIndex];
            if (insertIndex < children.length && insertBeforeElement) {
                chatContainer.insertBefore(container, insertBeforeElement);
            } else {
                chatContainer.appendChild(container);
            }
        } else {
            chatContainer.appendChild(container);
        }

        console.log(`MessageHydrator: Injected message ${message.id} with user prompt`);
    }

    /**
     * Find the DOM element that matches the anchor.
     * Uses a three-layer fallback strategy for cross-device reliability:
     *   1. geminiMessageId — Gemini's native conversation-container ID (instant, most reliable)
     *   2. stableContentHash — hash of message body text only, excluding UI chrome
     *   3. precedingMessageSnippet — substring match (last resort)
     */
    private async findAnchorElement(
        container: HTMLElement,
        anchor: MessageAnchor
    ): Promise<Element | null> {
        // === Layer 1: Gemini's native message ID (most reliable across devices) ===
        if (anchor.geminiMessageId) {
            const element = container.querySelector(`#${CSS.escape(anchor.geminiMessageId)}`);
            if (element) {
                console.log(`MessageHydrator: Anchor found via geminiMessageId: ${anchor.geminiMessageId}`);
                return element;
            }
        }

        // === Layer 2 & 3: Hash / Snippet matching with retries ===
        let retries = 0;

        while (retries < MAX_ANCHOR_RETRIES) {
            // Use selectors that actually match Gemini's DOM structure
            const elements = container.querySelectorAll(
                '.conversation-container:not(.council-conversation-container), ' +
                'model-response:not(.council-conversation-container), ' +
                '[role="article"]:not(.council-conversation-container)'
            );

            for (const element of Array.from(elements)) {
                const content = this.extractStableContent(element);

                // Layer 2: stable content hash
                const hash = this.hashContent(content);
                if (hash === anchor.precedingMessageHash) {
                    console.log("MessageHydrator: Anchor found via stable content hash");
                    return element;
                }

                // Layer 3: snippet substring match
                if (anchor.precedingMessageSnippet &&
                    content.includes(anchor.precedingMessageSnippet)) {
                    console.log("MessageHydrator: Anchor found via snippet match");
                    return element;
                }
            }

            retries++;
            await this.sleep(ANCHOR_RETRY_DELAY_MS);
        }

        console.warn("MessageHydrator: Could not find anchor element via any strategy");
        return null;
    }

    /**
     * Extract only the stable message body text from an element,
     * excluding locale-dependent UI chrome (buttons, tooltips, aria-labels, etc.)
     * Mirrors StorageBridge.extractStableContent for consistent hashing.
     */
    private extractStableContent(element: Element): string {
        // For model responses, extract only the markdown content
        const markdown = element.querySelector('.markdown');
        if (markdown) {
            return markdown.textContent?.trim() || '';
        }

        // For user queries, extract only the query text lines
        const queryText = element.querySelector('.query-text');
        if (queryText) {
            const lines = queryText.querySelectorAll('.query-text-line');
            if (lines.length > 0) {
                return Array.from(lines).map(l => l.textContent?.trim() || '').join('\n');
            }
            return queryText.textContent?.trim() || '';
        }

        // For combined containers, try both parts
        const parts: string[] = [];
        const userQ = element.querySelector('user-query-content .query-text');
        if (userQ) parts.push(userQ.textContent?.trim() || '');

        const modelR = element.querySelector('message-content .markdown');
        if (modelR) parts.push(modelR.textContent?.trim() || '');

        if (parts.length > 0) return parts.join('\n');

        // Final fallback
        return element.textContent || '';
    }

    /**
     * Simple hash function for content comparison
     */
    private hashContent(content: string): string {
        let hash = 5381;
        for (let i = 0; i < content.length; i++) {
            hash = ((hash << 5) + hash) + content.charCodeAt(i);
            hash = hash & hash;
        }
        return Math.abs(hash).toString(36);
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
