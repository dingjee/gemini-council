/**
 * ContextInjector - Floating popover for injecting Council context into Gemini
 * 
 * Appears as a compact floating card above the input area (right side),
 * similar to Gemini's native attachment previews.
 * Allows users to select/deselect which Council messages to include as context.
 */

export interface CouncilMessageItem {
    id: string;
    modelId: string;
    modelName: string;
    userPrompt: string;
    content: string;
    selected: boolean;
}

export class ContextInjector {
    private container: HTMLElement | null = null;
    private messages: CouncilMessageItem[] = [];
    private collapsed: boolean = false;
    private static instance: ContextInjector | null = null;
    private static STYLE_ID = "council-context-injector-styles";

    private constructor() { }

    static getInstance(): ContextInjector {
        if (!ContextInjector.instance) {
            ContextInjector.instance = new ContextInjector();
        }
        return ContextInjector.instance;
    }

    getMessages(): CouncilMessageItem[] {
        return this.messages;
    }

    hasMessages(): boolean {
        return this.messages.length > 0;
    }

    hasSelectedMessages(): boolean {
        return this.messages.some(m => m.selected);
    }

    updateMessages(messages: CouncilMessageItem[]): void {
        this.messages = messages.map(m => ({ ...m, selected: true }));
        this.render();
    }

    toggleMessage(id: string): void {
        const msg = this.messages.find(m => m.id === id);
        if (msg) {
            msg.selected = !msg.selected;
            this.render();
        }
    }

    toggleAll(selected: boolean): void {
        this.messages.forEach(m => m.selected = selected);
        this.render();
    }

    toggleCollapse(): void {
        this.collapsed = !this.collapsed;
        this.render();
    }

    show(): void {
        if (!this.container) {
            this.injectStyles();
            this.createContainer();
        }
        this.render();
        if (this.container) {
            this.container.style.display = "block";
        }
    }

    hide(): void {
        if (this.container) {
            this.container.style.display = "none";
        }
    }

    destroy(): void {
        this.container?.remove();
        this.container = null;
        document.getElementById(ContextInjector.STYLE_ID)?.remove();
    }

    getSelectedContextText(): string {
        const selected = this.messages.filter(m => m.selected);
        if (selected.length === 0) return "";

        const parts = selected.map(m => {
            const contentPreview = m.content.length > 500
                ? m.content.substring(0, 500) + "..."
                : m.content;
            return `### ${m.modelName}\n**User:** ${m.userPrompt}\n**Response:**\n${contentPreview}`;
        });

        return `[Council Context - ${selected.length} message${selected.length > 1 ? "s" : ""}]\n\n${parts.join("\n\n---\n\n")}\n\n---\n\n`;
    }

    private createContainer(): void {
        this.container = document.createElement("div");
        this.container.id = "council-context-injector";

        // Insert inside the input-area's text-input-field, above the text area
        // This mimics how Gemini's attachment previews appear above the text input
        const textInputField = document.querySelector('.text-input-field');
        if (textInputField) {
            // Insert at the very beginning of text-input-field
            textInputField.insertBefore(this.container, textInputField.firstChild);
        } else {
            // Fallback: find input area and insert before it
            const inputArea = document.querySelector('[data-node-type="input-area"]');
            if (inputArea) {
                inputArea.insertBefore(this.container, inputArea.firstChild);
            } else {
                document.body.appendChild(this.container);
            }
        }
    }

    private render(): void {
        if (!this.container) return;

        const selectedCount = this.messages.filter(m => m.selected).length;
        const totalCount = this.messages.length;

        this.container.innerHTML = `
            <div class="council-ctx-header" data-action="toggle">
                <div class="council-ctx-header-left">
                    <svg class="council-ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                    <span class="council-ctx-title">Council (${selectedCount}/${totalCount})</span>
                </div>
                <div class="council-ctx-header-right">
                    <button class="council-ctx-action-btn" data-action="select-all" title="Select all">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/></svg>
                    </button>
                    <button class="council-ctx-action-btn" data-action="deselect-all" title="Deselect all">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                    </button>
                    <span class="council-ctx-collapse">${this.collapsed ? "\u25B6" : "\u25BC"}</span>
                </div>
            </div>
            <div class="council-ctx-body ${this.collapsed ? "collapsed" : ""}">
                <div class="council-ctx-messages">
                    ${this.messages.map(m => this.renderMessageItem(m)).join("")}
                </div>
            </div>
        `;

        this.attachEventListeners();
    }

    private renderMessageItem(msg: CouncilMessageItem): string {
        const contentPreview = msg.content.length > 60
            ? msg.content.substring(0, 60).replace(/\n/g, " ") + "..."
            : msg.content.replace(/\n/g, " ");
        const promptPreview = msg.userPrompt.length > 30
            ? msg.userPrompt.substring(0, 30) + "..."
            : msg.userPrompt;

        return `
            <div class="council-ctx-item ${msg.selected ? "selected" : ""}" data-id="${msg.id}">
                <input type="checkbox" class="council-ctx-check" 
                       ${msg.selected ? "checked" : ""} data-id="${msg.id}">
                <span class="council-ctx-badge">${this.getModelShortName(msg.modelName)}</span>
                <div class="council-ctx-text">
                    <span class="council-ctx-prompt">${this.escapeHtml(promptPreview)}</span>
                    <span class="council-ctx-preview">${this.escapeHtml(contentPreview)}</span>
                </div>
            </div>
        `;
    }

    private getModelShortName(name: string): string {
        const parts = name.split("/");
        const last = parts[parts.length - 1] ?? name;
        return parts.length > 1 ? last.substring(0, 12) : name.substring(0, 12);
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
    }

    private attachEventListeners(): void {
        if (!this.container) return;

        this.container.querySelectorAll("[data-action]").forEach(el => {
            el.addEventListener("click", (e) => {
                e.stopPropagation();
                const action = (e.currentTarget as HTMLElement).dataset.action;
                switch (action) {
                    case "toggle":
                        this.toggleCollapse();
                        break;
                    case "select-all":
                        this.toggleAll(true);
                        break;
                    case "deselect-all":
                        this.toggleAll(false);
                        break;
                }
            });
        });

        this.container.querySelectorAll(".council-ctx-check").forEach(el => {
            el.addEventListener("change", (e) => {
                const id = (e.target as HTMLInputElement).dataset.id;
                if (id) this.toggleMessage(id);
            });
        });

        this.container.querySelectorAll(".council-ctx-item").forEach(el => {
            el.addEventListener("click", (e) => {
                if ((e.target as HTMLElement).tagName !== "INPUT") {
                    const id = (e.currentTarget as HTMLElement).dataset.id;
                    if (id) this.toggleMessage(id);
                }
            });
        });
    }

    private injectStyles(): void {
        if (document.getElementById(ContextInjector.STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = ContextInjector.STYLE_ID;
        style.textContent = `
            #council-context-injector {
                font-family: 'Google Sans', 'Helvetica Neue', sans-serif;
                margin: 0 4px 4px 4px;
                border-radius: 12px;
                background: var(--gem-sys-color--surface-container-high, #252525);
                border: 1px solid var(--gem-sys-color--outline-variant, rgba(255,255,255,0.1));
                overflow: hidden;
                font-size: 11px;
                width: 100%;
                box-sizing: border-box;
            }

            .council-ctx-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 5px 8px;
                cursor: pointer;
                transition: background 0.2s;
                gap: 4px;
            }

            .council-ctx-header:hover {
                background: rgba(255, 255, 255, 0.04);
            }

            .council-ctx-header-left {
                display: flex;
                align-items: center;
                gap: 6px;
                min-width: 0;
            }

            .council-ctx-icon {
                width: 14px;
                height: 14px;
                flex-shrink: 0;
                opacity: 0.7;
            }

            .council-ctx-title {
                font-weight: 500;
                font-size: 11px;
                color: var(--gem-sys-color--on-surface, #e3e3e3);
                white-space: nowrap;
            }

            .council-ctx-header-right {
                display: flex;
                align-items: center;
                gap: 2px;
                flex-shrink: 0;
            }

            .council-ctx-action-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 22px;
                height: 22px;
                border: none;
                background: transparent;
                color: var(--gem-sys-color--on-surface-variant, #9aa0a6);
                cursor: pointer;
                border-radius: 4px;
                padding: 3px;
                transition: all 0.15s;
            }
            .council-ctx-action-btn:hover {
                background: rgba(255,255,255,0.08);
                color: var(--gem-sys-color--on-surface, #e3e3e3);
            }
            .council-ctx-action-btn svg {
                width: 14px;
                height: 14px;
            }

            .council-ctx-collapse {
                color: var(--gem-sys-color--on-surface-variant, #9aa0a6);
                font-size: 8px;
                margin-left: 2px;
            }

            .council-ctx-body {
                max-height: 150px;
                overflow-y: auto;
                transition: max-height 0.25s ease;
            }
            .council-ctx-body.collapsed {
                max-height: 0;
                overflow: hidden;
            }

            .council-ctx-messages {
                display: flex;
                flex-direction: column;
                gap: 2px;
                padding: 4px;
            }

            .council-ctx-item {
                display: flex;
                align-items: center;
                padding: 4px 6px;
                border-radius: 8px;
                cursor: pointer;
                transition: background 0.15s;
                gap: 6px;
                border: 1px solid transparent;
            }
            .council-ctx-item:hover {
                background: rgba(255, 255, 255, 0.04);
            }
            .council-ctx-item.selected {
                background: rgba(102, 126, 234, 0.08);
                border-color: rgba(102, 126, 234, 0.2);
            }

            .council-ctx-check {
                margin: 0;
                accent-color: #667eea;
                width: 12px;
                height: 12px;
                cursor: pointer;
                flex-shrink: 0;
            }

            .council-ctx-badge {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 1px 5px;
                border-radius: 4px;
                font-size: 9px;
                font-weight: 600;
                white-space: nowrap;
                flex-shrink: 0;
            }

            .council-ctx-text {
                flex: 1;
                min-width: 0;
                display: flex;
                flex-direction: column;
                gap: 1px;
            }

            .council-ctx-prompt {
                color: var(--gem-sys-color--on-surface, #e3e3e3);
                font-size: 10px;
                font-weight: 500;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .council-ctx-preview {
                color: var(--gem-sys-color--on-surface-variant, #9aa0a6);
                font-size: 9px;
                line-height: 1.2;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }
        `;

        document.head.appendChild(style);
    }
}

export const getContextInjector = ContextInjector.getInstance;
