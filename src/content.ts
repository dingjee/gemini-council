/**
 * Content Script - Gemini Council
 * 
 * Injects into Gemini's web interface to:
 * - Intercept user queries for external model processing
 * - Persist messages to local storage
 * - Hydrate previous messages on page load
 * - Sync with Google Drive in background
 */

import { ModelSelector } from "./features/council/ui/ModelSelector";
import { MessageRenderer } from "./features/council/ui/MessageRenderer";
import { DOMContentExtractor } from "./features/council/core/DOMContentExtractor";
import { StorageBridge } from "./features/council/storage/StorageBridge";
import { MessageHydrator } from "./features/council/storage/MessageHydrator";
import { ContextInjector, type CouncilMessageItem } from "./features/council/ui/ContextInjector";
import type { MessageAnchor } from "./core/types/storage.types";

console.log("Gemini Council: Content script loaded.");

const CONTEXT_THRESHOLD = 3000; // ~12k chars

class CouncilManager {
    private selector: ModelSelector;
    private inputElement: HTMLElement | null = null;
    private sendButton: HTMLElement | null = null;
    private sendButtonContainer: HTMLElement | null = null;
    private observer: MutationObserver | null = null;
    private hydrator: MessageHydrator;
    private contextInjector: ContextInjector;
    private contextCheckTimeout: number | undefined;

    constructor() {
        this.selector = new ModelSelector(this.handleModelChange.bind(this));
        this.hydrator = new MessageHydrator();
        this.contextInjector = ContextInjector.getInstance();
        this.startObserving();
        setInterval(() => this.checkContextSize(), 5000);

        this.initializeHydration();

        document.addEventListener('council:redo', ((e: CustomEvent) => {
            const { modelId, modelName, userPrompt } = e.detail;
            this.redoQuery(modelId, modelName, userPrompt);
        }) as EventListener);
    }

    /**
     * Initialize hydration of stored messages.
     * The hydrator internally waits for sync readiness before reading from IndexedDB.
     */
    private async initializeHydration(): Promise<void> {
        try {
            await this.hydrator.hydrate();
            console.log("Gemini Council: Hydration complete");

            this.updateContextInjector();
        } catch (error) {
            console.warn("Gemini Council: Hydration failed", error);
        }
    }

    private handleModelChange(model: string) {
        console.log("Gemini Council: Active model changed to", model);
        this.checkContextSize();
        this.updateContextInjector();
    }

    private async updateContextInjector(): Promise<void> {
        const councilMessages = this.extractCouncilMessagesFromDOM();
        const hasCouncil = councilMessages.length > 0;

        console.log('Gemini Council: updateContextInjector', { hasCouncil, count: councilMessages.length });

        // Always sync the ModelSelector's inline toggle state
        this.selector.setHasCouncilContent(hasCouncil, councilMessages.length);

        // Show the ContextInjector card (detailed message selection) only for native model
        if (hasCouncil && !this.selector.isExternalModel()) {
            this.contextInjector.updateMessages(councilMessages);
            this.contextInjector.show();
        } else {
            this.contextInjector.hide();
        }
    }

    private extractCouncilMessagesFromDOM(): CouncilMessageItem[] {
        const messages: CouncilMessageItem[] = [];
        const seenIds = new Set<string>();

        // Pattern 1: Real-time responses — .council-model-response is INSIDE .council-conversation-container
        const containers = document.querySelectorAll('.council-conversation-container');
        containers.forEach(container => {
            const modelResponse = container.querySelector('.council-model-response') as HTMLElement | null;
            if (!modelResponse) return;

            const id = modelResponse.id || crypto.randomUUID();
            if (seenIds.has(id)) return;
            seenIds.add(id);

            const modelId = modelResponse.dataset?.modelId || '';
            const modelName = modelResponse.dataset?.modelName || 'Unknown';
            const userPrompt = modelResponse.dataset?.userPrompt || container.querySelector('.council-user-query-text')?.textContent || '';
            const markdownEl = modelResponse.querySelector('.council-markdown');
            const content = markdownEl?.getAttribute('data-raw-content') || markdownEl?.textContent || '';

            messages.push({ id, modelId, modelName, userPrompt, content, selected: true });
        });

        // Pattern 2: Hydrated responses — .council-model-response is a SIBLING inside .council-hydrated-group
        const hydratedGroups = document.querySelectorAll('.council-hydrated-group');
        hydratedGroups.forEach(group => {
            const modelResponse = group.querySelector('.council-model-response') as HTMLElement | null;
            if (!modelResponse) return;

            const id = modelResponse.id || modelResponse.dataset?.hydratedMessageId || crypto.randomUUID();
            if (seenIds.has(id)) return;
            seenIds.add(id);

            const modelId = modelResponse.dataset?.modelId || '';
            const modelName = modelResponse.dataset?.modelName || 'Unknown';
            const userPrompt = modelResponse.dataset?.userPrompt || group.querySelector('.council-user-query-text')?.textContent || '';
            const markdownEl = modelResponse.querySelector('.council-markdown');
            const content = markdownEl?.getAttribute('data-raw-content') || markdownEl?.textContent || '';

            messages.push({ id, modelId, modelName, userPrompt, content, selected: true });
        });

        return messages;
    }

    private startObserving() {
        this.observer = new MutationObserver(() => {
            this.detectElements();
        });

        this.observer.observe(document.body, { childList: true, subtree: true });
        this.detectElements();
    }

    private detectElements() {
        // Detect input element
        if (!this.inputElement || !document.body.contains(this.inputElement)) {
            const input = document.querySelector('div[contenteditable="true"][role="textbox"]') as HTMLElement;
            if (input && input !== this.inputElement) {
                this.inputElement = input;
                this.attachInputListeners();
                console.log("Gemini Council: Input detected");
            }
        }

        // Detect send button using the specific selector from Gemini's HTML
        if (!this.sendButton || !document.body.contains(this.sendButton)) {
            // Primary selector: button with aria-label="Send message"
            let sendBtn = document.querySelector('button[aria-label="Send message"]') as HTMLElement;

            // Fallback: find button inside send-button-container
            if (!sendBtn) {
                const container = document.querySelector('.send-button-container');
                if (container) {
                    sendBtn = container.querySelector('button') as HTMLElement;
                    this.sendButtonContainer = container as HTMLElement;
                }
            }

            // Another fallback
            if (!sendBtn) {
                sendBtn = document.querySelector('button.send-button') as HTMLElement;
            }

            if (sendBtn && sendBtn !== this.sendButton) {
                this.sendButton = sendBtn;
                this.attachSendListener();
                console.log("Gemini Council: Send button detected");
            }
        }
    }

    private attachInputListeners() {
        if (!this.inputElement) return;

        this.inputElement.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                if (this.selector.isExternalModel()) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    this.triggerCouncil();
                } else {
                    this.injectContextToInput();
                }
            }
        }, true);
    }

    private attachSendListener() {
        if (!this.sendButton) return;

        this.sendButton.addEventListener("click", (e) => {
            if (this.selector.isExternalModel()) {
                e.preventDefault();
                e.stopImmediatePropagation();
                e.stopPropagation();
                this.triggerCouncil();
            } else {
                this.injectContextToInput();
            }
        }, true);

        this.sendButton.addEventListener("mousedown", (e) => {
            if (this.selector.isExternalModel()) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }, true);

        this.sendButton.addEventListener("touchstart", (e) => {
            if (this.selector.isExternalModel()) {
                e.preventDefault();
                e.stopImmediatePropagation();
                this.triggerCouncil();
            } else {
                this.injectContextToInput();
            }
        }, true);
    }

    private injectContextToInput(): void {
        if (!this.inputElement) return;
        if (!this.selector.shouldAttachCouncilContext()) return;
        if (!this.contextInjector.hasSelectedMessages()) return;

        const contextText = this.contextInjector.getSelectedContextText();
        if (!contextText) return;

        const currentText = this.getInputText();

        if (currentText.includes('[Council Context]')) return;

        const newText = contextText + currentText;

        this.setQuillContent(newText);

        console.log('Gemini Council: Injected context into input');
    }

    private setQuillContent(text: string): void {
        if (!this.inputElement) return;

        const quillEditor = this.inputElement.closest('.ql-container') ||
            this.inputElement.querySelector('.ql-editor') ||
            this.inputElement;

        const editorEl = quillEditor.classList.contains('ql-editor')
            ? quillEditor as HTMLElement
            : quillEditor.querySelector('.ql-editor') as HTMLElement;

        if (!editorEl) {
            this.inputElement.innerText = text;
            return;
        }

        const paragraphs = text.split('\n').filter(p => p.trim());
        editorEl.innerHTML = paragraphs.map(p => `<p>${this.escapeHtml(p)}</p>`).join('');

        editorEl.focus();

        this.triggerAngularChangeDetection(editorEl);

        this.placeCaretAtEnd(editorEl);
    }

    private triggerAngularChangeDetection(el: HTMLElement): void {
        el.dispatchEvent(new InputEvent('input', {
            bubbles: true,
            cancelable: true,
            inputType: 'insertText',
            data: el.textContent
        }));

        el.dispatchEvent(new Event('change', { bubbles: true }));

        const keydownEvent = new KeyboardEvent('keydown', {
            bubbles: true,
            cancelable: true,
            key: ' ',
            code: 'Space'
        });
        el.dispatchEvent(keydownEvent);

        const keyupEvent = new KeyboardEvent('keyup', {
            bubbles: true,
            cancelable: true,
            key: ' ',
            code: 'Space'
        });
        el.dispatchEvent(keyupEvent);
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
    }

    private placeCaretAtEnd(el: HTMLElement): void {
        el.focus();
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        if (sel) {
            sel.removeAllRanges();
            sel.addRange(range);
        }
    }

    private getInputText(): string {
        if (!this.inputElement) return "";

        // Get text content, handling Gemini's rich-textarea structure
        const text = this.inputElement.innerText || this.inputElement.textContent || "";
        return text.trim();
    }

    private clearInput() {
        if (!this.inputElement) return;

        // Clear the contenteditable
        this.inputElement.innerHTML = "<p><br></p>";

        // Dispatch input event to trigger Gemini's UI updates
        this.inputElement.dispatchEvent(new Event('input', { bubbles: true }));
    }

    private checkContextSize() {
        if (!this.selector.isExternalModel()) return;

        // Roughly estimate tokens
        // This can be expensive so don't run too often
        const history = DOMContentExtractor.extractChatHistory();
        let totalChars = 0;
        history.forEach(turn => {
            totalChars += turn.text.length;
        });

        const estimatedTokens = Math.ceil(totalChars / 4);
        this.selector.setContextSize(estimatedTokens, CONTEXT_THRESHOLD);
    }

    /**
     * Find the last message element in the chat for anchoring
     */
    private findLastMessageElement(): Element | null {
        const chatContainer = MessageRenderer.findChatContainer();
        if (!chatContainer) return null;

        // Find the last Gemini message (not our injected ones)
        const messages = chatContainer.querySelectorAll(
            '[role="article"]:not(.council-conversation-container), ' +
            '[data-message]:not(.council-conversation-container), ' +
            '.conversation-container:not(.council-conversation-container)'
        );

        const lastMessage = messages[messages.length - 1];
        return messages.length > 0 && lastMessage ? lastMessage : null;
    }

    /**
     * Count current native Gemini messages for position index.
     * Excludes council-injected messages to prevent index drift.
     */
    private getCurrentMessageIndex(): number {
        const chatContainer = MessageRenderer.findChatContainer();
        if (!chatContainer) return 0;

        // Only count native Gemini conversation containers, not our injected ones
        const nativeMessages = chatContainer.querySelectorAll(
            '.conversation-container:not(.council-conversation-container):not(.council-hydrated-group)'
        );
        return nativeMessages.length;
    }

    private async triggerCouncil() {
        const text = this.getInputText();
        if (!text) return;

        const modelId = this.selector.getActiveModel();
        const modelName = this.selector.getActiveModelName();
        const councilContextAttached = this.selector.shouldAttachCouncilContext();

        console.log("Gemini Council: Triggering query to", modelId, "Council ctx:", councilContextAttached);

        // Clear input
        this.clearInput();

        // Find chat container
        const chatContainer = MessageRenderer.findChatContainer();
        if (!chatContainer) {
            console.error("Gemini Council: Could not find chat container");
            return;
        }

        // Capture anchor BEFORE injecting our message
        const precedingElement = this.findLastMessageElement();
        const positionIndex = this.getCurrentMessageIndex();
        const anchor = StorageBridge.createAnchor(precedingElement, positionIndex);

        // Inject user message
        const userMessage = MessageRenderer.createUserMessage(text);
        chatContainer.appendChild(userMessage);

        // Prepare prompt with context if needed
        let finalPrompt = text;

        // 1. Attach native Gemini chat history for external models
        if (this.selector.shouldAttachChatHistory()) {
            const history = DOMContentExtractor.extractChatHistory();
            if (history.length > 0) {
                const contextText = history.map(turn =>
                    `[${turn.role.toUpperCase()}]:\n${turn.text}`
                ).join('\n\n');

                finalPrompt = `Below is the conversation history for context:\n\n${contextText}\n\n[CURRENT USER QUERY]:\n${text}`;
            }
        }

        // 2. Attach other council model responses if checkbox is checked
        if (this.selector.shouldAttachCouncilContext() && this.contextInjector.hasSelectedMessages()) {
            const councilText = this.contextInjector.getSelectedContextText();
            if (councilText) {
                finalPrompt = councilText + finalPrompt;
            }
        }

        // Truncate if way too large
        if (finalPrompt.length > 200000) {
            finalPrompt = finalPrompt.slice(finalPrompt.length - 200000);
            finalPrompt = "[Context Truncated]...\n" + finalPrompt;
        }

        // Inject loading state
        const loadingElement = MessageRenderer.createLoadingResponse(modelId, modelName);
        userMessage.appendChild(loadingElement);
        loadingElement.scrollIntoView({ behavior: "smooth", block: "end" });

        try {
            // Send to background script
            const response = await chrome.runtime.sendMessage({
                type: "COUNCIL_QUERY",
                payload: { model: modelId, prompt: finalPrompt }
            });

            if (response.success && response.data?.choices?.[0]?.message?.content) {
                const content = response.data.choices[0].message.content;
                const responseElement = MessageRenderer.createModelResponse(modelId, modelName, content, text);
                MessageRenderer.replaceLoading(loadingElement, responseElement);

                // Update context injector so the toggle reflects new council content
                this.updateContextInjector();

                // Persist to storage (async, don't await)
                this.persistMessage({
                    modelId,
                    modelName,
                    userPrompt: text,
                    content,
                    contextAttached: councilContextAttached,
                }, anchor);
            } else {
                const error = response.error || "Unknown error";
                const errorElement = MessageRenderer.createErrorResponse(modelId, modelName, error, text);
                MessageRenderer.replaceLoading(loadingElement, errorElement);
            }
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error("Gemini Council: Error:", errorMessage);
            const errorElement = MessageRenderer.createErrorResponse(modelId, modelName, errorMessage, text);
            MessageRenderer.replaceLoading(loadingElement, errorElement);
        }
    }

    /**
     * Redo a previous query
     */
    private async redoQuery(modelId: string, modelName: string, userPrompt: string): Promise<void> {
        console.log("Gemini Council: Redoing query for", modelId);

        const chatContainer = MessageRenderer.findChatContainer();
        if (!chatContainer) {
            console.error("Gemini Council: Could not find chat container");
            return;
        }

        const loadingElement = MessageRenderer.createLoadingResponse(modelId, modelName);
        chatContainer.appendChild(loadingElement);
        loadingElement.scrollIntoView({ behavior: "smooth", block: "end" });

        try {
            const response = await chrome.runtime.sendMessage({
                type: "COUNCIL_QUERY",
                payload: { model: modelId, prompt: userPrompt }
            });

            if (response.success && response.data?.choices?.[0]?.message?.content) {
                const content = response.data.choices[0].message.content;
                const responseElement = MessageRenderer.createModelResponse(modelId, modelName, content, userPrompt);
                MessageRenderer.replaceLoading(loadingElement, responseElement);
            } else {
                const error = response.error || "Unknown error";
                const errorElement = MessageRenderer.createErrorResponse(modelId, modelName, error, userPrompt);
                MessageRenderer.replaceLoading(loadingElement, errorElement);
            }
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error("Gemini Council: Redo error:", errorMessage);
            const errorElement = MessageRenderer.createErrorResponse(modelId, modelName, errorMessage, userPrompt);
            MessageRenderer.replaceLoading(loadingElement, errorElement);
        }
    }

    /**
     * Persist a message to storage (async, fire-and-forget)
     */
    private async persistMessage(
        params: {
            modelId: string;
            modelName: string;
            userPrompt: string;
            content: string;
            contextAttached: boolean;
        },
        anchor: MessageAnchor
    ): Promise<void> {
        try {
            const result = await StorageBridge.saveMessage(params, anchor);

            if (result.success) {
                console.log("Gemini Council: Message persisted", result.data?.id);
            } else {
                console.warn("Gemini Council: Failed to persist message", result.error);
            }
        } catch (error) {
            console.warn("Gemini Council: Persistence error", error);
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize
new CouncilManager();
