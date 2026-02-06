import { ModelSelector } from "./features/council/ui/ModelSelector";

console.log("Gemini Council: Content script loaded.");

class CouncilManager {
    private selector: ModelSelector;
    private inputElement: HTMLElement | null = null;
    private sendButton: HTMLElement | null = null;
    private chatContainer: HTMLElement | null = null;

    constructor() {
        this.selector = new ModelSelector(this.handleModelChange.bind(this));
        this.startObserving();
    }

    private handleModelChange(model: string) {
        console.log("Active Model Changed:", model);
    }

    private startObserving() {
        // Observe DOM for Input Box and Chat Container
        const observer = new MutationObserver((mutations) => {
            if (!this.inputElement || !this.chatContainer) {
                this.detectElements();
            }
        });

        observer.observe(document.body, { childList: true, subtree: true });
        this.detectElements();
    }

    private detectElements() {
        // Heuristic selectors for Gemini
        // ContentEditable usually has role="textbox"
        if (!this.inputElement) {
            const input = document.querySelector('div[contenteditable="true"][role="textbox"]') as HTMLElement;
            if (input) {
                this.inputElement = input;
                this.attachInputListeners();
                console.log("Gemini Council: Input detected");
            }
        }

        // Send button usually near input, often an SVG icon or button[aria-label="Send"]
        if (!this.sendButton) {
            const sendBtn = document.querySelector('button[aria-label*="Send"], button[aria-label*="Submit"]') as HTMLElement;
            if (sendBtn) {
                this.sendButton = sendBtn;
                this.attachSendListener();
                console.log("Gemini Council: Send button detected");
            }
        }

        // Chat container - usually the scrollable area
        if (!this.chatContainer) {
            // Look for a large scrollable container or one with role="main" -> list
            // This is harder. We might just append to the active visual list.
            // We'll look for the container of the message groups.
            // Usually found by looking up from a message.
            const exampleMessage = document.querySelector('div[data-message-id]');
            if (exampleMessage) {
                this.chatContainer = exampleMessage.parentElement;
                console.log("Gemini Council: Chat container detected");
            }
        }
    }

    private attachInputListeners() {
        if (!this.inputElement) return;

        this.inputElement.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                if (this.selector.getActiveModel() !== "gemini") {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    this.triggerCouncil();
                }
            }
        }, true); // Capture phase to prevent native listeners
    }

    private attachSendListener() {
        if (!this.sendButton) return;

        this.sendButton.addEventListener("click", (e) => {
            if (this.selector.getActiveModel() !== "gemini") {
                e.preventDefault();
                e.stopImmediatePropagation();
                this.triggerCouncil();
            }
        }, true);
    }

    private async triggerCouncil() {
        if (!this.inputElement) return;

        const text = this.inputElement.innerText || this.inputElement.textContent;
        if (!text || !text.trim()) return;

        // Clear Input
        this.inputElement.innerHTML = "";

        // Inject User Message
        this.injectMessage(text, "user");

        // Send to Background
        const model = this.selector.getActiveModel();

        // Show Loading
        const loadingId = this.injectMessage("Thinking...", "model", true);

        try {
            const response = await chrome.runtime.sendMessage({
                type: "COUNCIL_QUERY",
                payload: { model, prompt: text }
            });

            // Remove loading
            this.removeMessage(loadingId);

            if (response.success && response.data?.choices?.[0]?.message?.content) {
                this.injectMessage(response.data.choices[0].message.content, "model");
            } else {
                this.injectMessage("Error: " + (response.error || "Unknown error"), "error");
            }

        } catch (e: any) {
            this.removeMessage(loadingId);
            this.injectMessage("Extension Error: " + e.message, "error");
        }
    }

    private injectMessage(text: string, role: "user" | "model" | "error", isLoading: boolean = false): string {
        // Fallback injection if we can't clone
        // We really want to clone an existing message structure if possible
        const id = "msg-" + Date.now();
        const msgDiv = document.createElement("div");
        msgDiv.id = id;

        // Basic styling to mimic a message block
        msgDiv.style.padding = "20px";
        msgDiv.style.margin = "10px 0";
        msgDiv.style.borderRadius = "12px";
        msgDiv.style.fontFamily = "Google Sans, sans-serif";
        msgDiv.style.lineHeight = "1.6";
        msgDiv.style.color = "#fff"; // Dark mode assumption based on previous context

        if (role === "user") {
            msgDiv.style.backgroundColor = "#333";
            msgDiv.style.alignSelf = "flex-end";
            msgDiv.innerHTML = `<strong>You:</strong><br/>${this.escapeHtml(text)}`;
        } else if (role === "model") {
            msgDiv.style.backgroundColor = "transparent";
            msgDiv.innerHTML = `<strong>${this.selector.getActiveModel()}:</strong><br/>${isLoading ? "<em>" + text + "</em>" : this.formatMarkdown(text)}`;
        } else {
            msgDiv.style.backgroundColor = "#ff5555";
            msgDiv.innerText = text;
        }

        // Try to append to chat container, or falling back to body/main
        const container = this.chatContainer || document.querySelector('main') || document.body;
        container.appendChild(msgDiv);
        msgDiv.scrollIntoView({ behavior: "smooth" });
        return id;
    }

    private removeMessage(id: string) {
        const el = document.getElementById(id);
        if (el) el.remove();
    }

    private escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.innerText = text;
        return div.innerHTML;
    }

    private formatMarkdown(text: string): string {
        // Very simple formatter. Ideally use a markdown library.
        // Convert newlines to br
        return this.escapeHtml(text).replace(/\n/g, "<br/>");
    }
}

new CouncilManager();
