/**
 * ContextInjector - UI component for injecting Council context into Gemini
 * 
 * When switching back to Gemini native models, this component:
 * 1. Displays a collapsible card showing Council messages
 * 2. Allows users to select/deselect which messages to include
 * 3. Injects selected context into the input when sending
 */

import { MessageRenderer } from "./MessageRenderer";

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

    private constructor() {}

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
        this.container!.style.display = "block";
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
        
        const inputArea = this.findInputArea();
        if (inputArea && inputArea.parentElement) {
            inputArea.parentElement.insertBefore(this.container, inputArea);
        } else {
            document.body.appendChild(this.container);
        }
    }

    private findInputArea(): HTMLElement | null {
        const selectors = [
            "div[contenteditable=\"true\"][role=\"textbox\"]",
            ".input-area",
            ".compose-area", 
            "[data-compose-area]",
            ".send-button-container"
        ];

        for (const sel of selectors) {
            const el = document.querySelector(sel);
            if (el) {
                const textBox = sel.includes("textbox") ? el : el.querySelector('div[contenteditable="true"]');
                if (textBox) {
                    const parent = textBox.closest('.input-area, .compose-area, [data-compose-area]');
                    if (parent) return parent as HTMLElement;
                    return textBox.parentElement as HTMLElement;
                }
                return el as HTMLElement;
            }
        }

        return null;
    }

    private render(): void {
        if (!this.container) return;

        const selectedCount = this.messages.filter(m => m.selected).length;
        const totalCount = this.messages.length;

        this.container.innerHTML = `
            <div class="council-context-header" data-action="toggle">
                <span class="council-context-icon">📋</span>
                <span class="council-context-title">Council 上下文 (${selectedCount}/${totalCount})</span>
                <span class="council-context-toggle">${this.collapsed ? "▶" : "▼"}</span>
            </div>
            <div class="council-context-body ${this.collapsed ? "collapsed" : ""}">
                <div class="council-context-actions">
                    <button class="council-context-btn" data-action="select-all">全选</button>
                    <button class="council-context-btn" data-action="deselect-all">全不选</button>
                </div>
                <div class="council-context-messages">
                    ${this.messages.map(m => this.renderMessageItem(m)).join("")}
                </div>
            </div>
        `;

        this.attachEventListeners();
    }

    private renderMessageItem(msg: CouncilMessageItem): string {
        const contentPreview = msg.content.length > 150 
            ? msg.content.substring(0, 150).replace(/\n/g, " ") + "..." 
            : msg.content.replace(/\n/g, " ");

        return `
            <div class="council-context-item ${msg.selected ? "selected" : ""}" data-id="${msg.id}">
                <input type="checkbox" class="council-context-checkbox" 
                       ${msg.selected ? "checked" : ""} data-id="${msg.id}">
                <div class="council-context-item-content">
                    <div class="council-context-item-header">
                        <span class="council-context-model-badge">${this.getModelShortName(msg.modelName)}</span>
                        <span class="council-context-prompt">${this.escapeHtml(msg.userPrompt.substring(0, 50))}${msg.userPrompt.length > 50 ? "..." : ""}</span>
                    </div>
                    <div class="council-context-preview">${this.escapeHtml(contentPreview)}</div>
                </div>
            </div>
        `;
    }

    private getModelShortName(name: string): string {
        const parts = name.split("/");
        return parts.length > 1 ? parts[parts.length - 1].substring(0, 12) : name.substring(0, 12);
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

        this.container.querySelectorAll(".council-context-checkbox").forEach(el => {
            el.addEventListener("change", (e) => {
                const id = (e.target as HTMLInputElement).dataset.id;
                if (id) this.toggleMessage(id);
            });
        });

        this.container.querySelectorAll(".council-context-item").forEach(el => {
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
                margin: 8px 16px;
                border-radius: 12px;
                background: var(--gem-sys-color--surface-container, #1e1e1e);
                border: 1px solid var(--gem-sys-color--outline-variant, rgba(255,255,255,0.1));
                overflow: hidden;
                font-size: 13px;
            }

            .council-context-header {
                display: flex;
                align-items: center;
                padding: 10px 14px;
                cursor: pointer;
                background: var(--gem-sys-color--surface-container-high, #252525);
                transition: background 0.2s;
            }

            .council-context-header:hover {
                background: var(--gem-sys-color--surface-container-highest, #2d2d2d);
            }

            .council-context-icon {
                margin-right: 8px;
                font-size: 14px;
            }

            .council-context-title {
                flex: 1;
                font-weight: 500;
                color: var(--gem-sys-color--on-surface, #e3e3e3);
            }

            .council-context-toggle {
                color: var(--gem-sys-color--on-surface-variant, #9aa0a6);
                font-size: 10px;
            }

            .council-context-body {
                max-height: 300px;
                overflow-y: auto;
                transition: max-height 0.3s ease;
            }

            .council-context-body.collapsed {
                max-height: 0;
            }

            .council-context-actions {
                display: flex;
                gap: 8px;
                padding: 8px 14px;
                border-bottom: 1px solid var(--gem-sys-color--outline-variant, rgba(255,255,255,0.05));
            }

            .council-context-btn {
                background: transparent;
                border: 1px solid var(--gem-sys-color--outline, rgba(255,255,255,0.2));
                color: var(--gem-sys-color--on-surface-variant, #9aa0a6);
                padding: 4px 10px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 11px;
                transition: all 0.2s;
            }

            .council-context-btn:hover {
                background: var(--gem-sys-color--surface-container-highest, #2d2d2d);
                color: var(--gem-sys-color--on-surface, #e3e3e3);
            }

            .council-context-messages {
                padding: 8px;
            }

            .council-context-item {
                display: flex;
                align-items: flex-start;
                padding: 10px;
                border-radius: 8px;
                cursor: pointer;
                transition: background 0.2s;
                margin-bottom: 4px;
            }

            .council-context-item:last-child {
                margin-bottom: 0;
            }

            .council-context-item:hover {
                background: var(--gem-sys-color--surface-container-high, #252525);
            }

            .council-context-item.selected {
                background: rgba(102, 126, 234, 0.1);
                border: 1px solid rgba(102, 126, 234, 0.3);
            }

            .council-context-checkbox {
                margin-right: 10px;
                margin-top: 2px;
                accent-color: #667eea;
                width: 14px;
                height: 14px;
                cursor: pointer;
            }

            .council-context-item-content {
                flex: 1;
                min-width: 0;
            }

            .council-context-item-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 4px;
            }

            .council-context-model-badge {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 10px;
                font-weight: 500;
            }

            .council-context-prompt {
                color: var(--gem-sys-color--on-surface, #e3e3e3);
                font-size: 12px;
                font-weight: 500;
                overflow: hidden;
                text-overflow: ellipsis;
                white-space: nowrap;
            }

            .council-context-preview {
                color: var(--gem-sys-color--on-surface-variant, #9aa0a6);
                font-size: 11px;
                line-height: 1.4;
                overflow: hidden;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
            }
        `;

        document.head.appendChild(style);
    }
}

export const getContextInjector = ContextInjector.getInstance;
