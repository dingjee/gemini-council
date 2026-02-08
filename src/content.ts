import { ModelSelector } from "./features/council/ui/ModelSelector";
import { MessageRenderer } from "./features/council/ui/MessageRenderer";
import { DOMContentExtractor } from "./features/council/core/DOMContentExtractor";

console.log("Gemini Council: Content script loaded.");

const CONTEXT_THRESHOLD = 3000; // ~12k chars

class CouncilManager {
    private selector: ModelSelector;
    private inputElement: HTMLElement | null = null;
    private sendButton: HTMLElement | null = null;
    private sendButtonContainer: HTMLElement | null = null;
    private observer: MutationObserver | null = null;
    // Debounce context checking
    private contextCheckTimeout: number | undefined;

    constructor() {
        this.selector = new ModelSelector(this.handleModelChange.bind(this));
        this.startObserving();
        // Periodically check context size (every 5s)
        setInterval(() => this.checkContextSize(), 5000);
    }

    private handleModelChange(model: string) {
        console.log("Gemini Council: Active model changed to", model);
        this.checkContextSize();
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

        // Remove old listeners by cloning (if needed in future)
        this.inputElement.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                if (this.selector.isExternalModel()) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    this.triggerCouncil();
                }
            }
        }, true); // Capture phase
    }

    private attachSendListener() {
        if (!this.sendButton) return;

        // Intercept click on send button
        this.sendButton.addEventListener("click", (e) => {
            if (this.selector.isExternalModel()) {
                e.preventDefault();
                e.stopImmediatePropagation();
                e.stopPropagation();
                this.triggerCouncil();
            }
        }, true); // Capture phase

        // Also intercept mousedown for extra safety
        this.sendButton.addEventListener("mousedown", (e) => {
            if (this.selector.isExternalModel()) {
                e.preventDefault();
                e.stopImmediatePropagation();
            }
        }, true);

        // Intercept touch events for mobile
        this.sendButton.addEventListener("touchstart", (e) => {
            if (this.selector.isExternalModel()) {
                e.preventDefault();
                e.stopImmediatePropagation();
                this.triggerCouncil();
            }
        }, true);
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

    private async triggerCouncil() {
        const text = this.getInputText();
        if (!text) return;

        const modelId = this.selector.getActiveModel();
        const modelName = this.selector.getActiveModelName();
        const shouldAttachContext = this.selector.shouldAttachContext();

        console.log("Gemini Council: Triggering query to", modelId, "Context:", shouldAttachContext);

        // Clear input
        this.clearInput();

        // Find chat container
        const chatContainer = MessageRenderer.findChatContainer();
        if (!chatContainer) {
            console.error("Gemini Council: Could not find chat container");
            return;
        }

        // Inject user message
        const userMessage = MessageRenderer.createUserMessage(text);
        chatContainer.appendChild(userMessage);

        // Prepare prompt with context if needed
        let finalPrompt = text;
        if (shouldAttachContext) {
            const history = DOMContentExtractor.extractChatHistory();
            if (history.length > 0) {
                const contextText = history.map(turn =>
                    `[${turn.role.toUpperCase()}]:\n${turn.text}`
                ).join('\n\n');

                finalPrompt = `Below is the conversation history for context:\n\n${contextText}\n\n[CURRENT USER QUERY]:\n${text}`;

                // Truncate context if way too large to prevent complete failure (e.g. > 100k chars)
                // OpenRouter models handle large contexts well, but let's be safe
                if (finalPrompt.length > 200000) {
                    finalPrompt = finalPrompt.slice(finalPrompt.length - 200000);
                    finalPrompt = "[Context Truncated]...\n" + finalPrompt;
                }
            }
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
                const responseElement = MessageRenderer.createModelResponse(modelId, modelName, content);
                MessageRenderer.replaceLoading(loadingElement, responseElement);
            } else {
                const error = response.error || "Unknown error";
                const errorElement = MessageRenderer.createErrorResponse(modelId, modelName, error);
                MessageRenderer.replaceLoading(loadingElement, errorElement);
            }
        } catch (e: unknown) {
            const errorMessage = e instanceof Error ? e.message : String(e);
            console.error("Gemini Council: Error:", errorMessage);
            const errorElement = MessageRenderer.createErrorResponse(modelId, modelName, errorMessage);
            MessageRenderer.replaceLoading(loadingElement, errorElement);
        }
    }
}

// Initialize
new CouncilManager();
