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

// ============================================================================
// MessageHydrator Class
// ============================================================================

export class MessageHydrator {
    private hydrated = false;
    private hydratedMessageIds = new Set<string>();

    /**
     * Start the hydration process
     * Should be called when the content script initializes
     */
    async hydrate(): Promise<void> {
        if (this.hydrated) {
            console.log("MessageHydrator: Already hydrated, skipping");
            return;
        }

        // Wait for Gemini's UI to render
        await this.waitForChatContainer();

        console.log("MessageHydrator: Starting hydration...");

        const conversationId = StorageBridge.getConversationId();
        if (!conversationId) {
            console.log("MessageHydrator: No conversation ID, skipping hydration");
            return;
        }

        // Get stored conversation
        const result = await StorageBridge.getConversation(conversationId);

        if (!result.success || !result.data) {
            console.log("MessageHydrator: No stored conversation found");
            return;
        }

        const conversation = result.data;
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
     * Inject a single message into the DOM at the correct position
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

        // Find the anchor element
        const anchorElement = anchor
            ? await this.findAnchorElement(chatContainer, anchor)
            : null;

        // Create the message element
        const messageElement = MessageRenderer.createModelResponse(
            message.modelId,
            message.modelName,
            message.content
        );

        // Mark as hydrated (to distinguish from live responses)
        messageElement.dataset.hydratedMessageId = message.id;
        messageElement.classList.add("council-hydrated");

        // Inject at the correct position
        if (anchorElement) {
            // Insert after the anchor element
            if (anchorElement.nextSibling) {
                chatContainer.insertBefore(messageElement, anchorElement.nextSibling);
            } else {
                chatContainer.appendChild(messageElement);
            }
        } else if (anchor && anchor.positionIndex >= 0) {
            // Fallback: use position index
            const children = Array.from(chatContainer.children);
            const insertIndex = Math.min(anchor.positionIndex, children.length);

            const insertBeforeElement = children[insertIndex];
            if (insertIndex < children.length && insertBeforeElement) {
                chatContainer.insertBefore(messageElement, insertBeforeElement);
            } else {
                chatContainer.appendChild(messageElement);
            }
        } else {
            // Last resort: append to end
            chatContainer.appendChild(messageElement);
        }

        console.log(`MessageHydrator: Injected message ${message.id}`);
    }

    /**
     * Find the DOM element that matches the anchor
     */
    private async findAnchorElement(
        container: HTMLElement,
        anchor: MessageAnchor
    ): Promise<Element | null> {
        let retries = 0;

        while (retries < MAX_ANCHOR_RETRIES) {
            // Get all message-like elements
            const elements = container.querySelectorAll(
                '[role="article"], [data-message], .message-container'
            );

            for (const element of Array.from(elements)) {
                const content = element.textContent || "";

                // Check if content matches the anchor hash
                const hash = this.hashContent(content);
                if (hash === anchor.precedingMessageHash) {
                    return element;
                }

                // Check if snippet matches
                if (anchor.precedingMessageSnippet &&
                    content.includes(anchor.precedingMessageSnippet)) {
                    return element;
                }
            }

            retries++;
            await this.sleep(ANCHOR_RETRY_DELAY_MS);
        }

        console.warn("MessageHydrator: Could not find anchor element");
        return null;
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
