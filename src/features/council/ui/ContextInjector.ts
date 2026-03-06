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
    timestamp?: number;
}

export class ContextInjector {
    private container: HTMLElement | null = null;
    private messages: CouncilMessageItem[] = [];
    private collapsed: boolean = true;
    private isHovered: boolean = false;
    private limitContentLength: boolean = true;
    private mode: "native" | "external" = "native";
    private externalHistoryDepth: number = 0; // 0, 1, 3, 999
    private limitExternalTokens: boolean = true;
    public onSelectionChange: ((count: number) => void) | null = null;
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
        // External mode always has "messages" (the config options) to display
        return this.mode === "external" || this.messages.length > 0;
    }

    hasSelectedMessages(): boolean {
        if (this.mode === "native") {
            return this.messages.some(m => m.selected);
        }
        return this.externalHistoryDepth > 0;
    }

    setMode(mode: "native" | "external"): void {
        if (this.mode !== mode) {
            this.mode = mode;
            this.render();
        }
    }

    getHistoryConfig(): { depth: number, limit: boolean } {
        return { depth: this.externalHistoryDepth, limit: this.limitExternalTokens };
    }

    updateMessages(messages: CouncilMessageItem[]): void {
        const oldState = new Map(this.messages.map(m => [m.id, m.selected]));
        this.messages = messages.map(m => ({
            ...m,
            selected: oldState.has(m.id) ? oldState.get(m.id)! : true
        }));
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
        if (this.mode === "native") {
            this.messages.forEach(m => m.selected = selected);
        } else {
            this.externalHistoryDepth = selected ? 999 : 0;
        }
        this.render();
    }

    toggleCollapse(): void {
        this.collapsed = !this.collapsed;
        this.render();
    }

    setCollapsed(collapsed: boolean): void {
        if (this.collapsed !== collapsed) {
            this.collapsed = collapsed;
            this.render();
        }
    }

    isCollapsed(): boolean {
        return this.collapsed;
    }

    isHovering(): boolean {
        return this.isHovered;
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

        const maxLengthPerMessage = this.limitContentLength ? Math.floor(6000 / selected.length) : Infinity;

        const parts = selected.map(m => {
            const contentPreview = m.content.length > maxLengthPerMessage
                ? m.content.substring(0, maxLengthPerMessage) + "..."
                : m.content;
            return `### ${m.modelName}\n**User:** ${m.userPrompt}\n**Response:**\n${contentPreview}`;
        });

        return `[Council Context - ${selected.length} message${selected.length > 1 ? "s" : ""}]\n\n${parts.join("\n\n---\n\n")}\n\n---\n\n`;
    }

    private createContainer(): void {
        this.container = document.createElement("div");
        this.container.id = "council-context-injector";

        // Prevent mousedown on the injector from stealing focus from the input box
        this.container.addEventListener("mousedown", (e) => {
            e.preventDefault();
        });

        this.container.addEventListener("mouseenter", () => {
            this.isHovered = true;
        });

        this.container.addEventListener("mouseleave", () => {
            this.isHovered = false;
        });

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

        if (this.mode === "native") {
            this.renderNativeMode();
        } else {
            this.renderExternalMode();
        }

        this.attachEventListeners();
    }

    private renderNativeMode(): void {
        const selectedCount = this.messages.filter(m => m.selected).length;
        const totalCount = this.messages.length;

        this.container!.innerHTML = `
            <div class="council-ctx-header" data-action="toggle">
                <div class="council-ctx-header-left">
                    <svg class="council-ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                    <span class="council-ctx-title">Council 卡片 (${selectedCount}/${totalCount})</span>
                </div>
                <div class="council-ctx-header-right">
                    <label class="council-ctx-limit-label" title="自动限制总字数不超过 6000 字">
                        <input type="checkbox" class="council-ctx-limit-check" ${this.limitContentLength ? "checked" : ""}>
                        <span>总限制</span>
                    </label>
                    <button class="council-ctx-action-btn" data-action="select-all" title="全选">
                        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"/></svg>
                    </button>
                    <button class="council-ctx-action-btn" data-action="deselect-all" title="全不选">
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

        this.onSelectionChange?.(selectedCount);
    }

    private renderExternalMode(): void {
        const options = [
            { val: 0, label: "不附带", desc: "仅发送当前问题" },
            { val: 1, label: "前 1 条", desc: "包含最新的一轮对话" },
            { val: 3, label: "前 3 条", desc: "包含最近的三轮对话" },
            { val: 999, label: "全 部", desc: "包含此页所有聊天记录" },
        ];

        const cards = options.map(opt => `
            <div class="council-ctx-item council-ctx-item-ext ${this.externalHistoryDepth === opt.val ? "selected" : ""}" data-history-val="${opt.val}">
                <div class="council-ctx-item-top" style="margin-bottom: 2px;">
                    <span class="council-ctx-badge" style="background:var(--gem-sys-color--surface-variant, #444);">${opt.label}</span>
                    <input type="radio" name="ext_history" class="council-ctx-radio council-ctx-check" 
                           ${this.externalHistoryDepth === opt.val ? "checked" : ""} data-history-val="${opt.val}">
                </div>
                <div class="council-ctx-text" style="justify-content:center;">
                    <span class="council-ctx-preview" style="text-align:left;">${opt.desc}</span>
                </div>
            </div>
        `).join("");

        this.container!.innerHTML = `
            <div class="council-ctx-header" data-action="toggle">
                <div class="council-ctx-header-left">
                    <svg class="council-ctx-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    <span class="council-ctx-title">上下文记忆 (History)</span>
                </div>
                <div class="council-ctx-header-right">
                    <label class="council-ctx-limit-label" title="限制Token以节约开销">
                        <input type="checkbox" class="council-ext-limit-check" ${this.limitExternalTokens ? "checked" : ""}>
                        <span>字数限制</span>
                    </label>
                    <span class="council-ctx-collapse">${this.collapsed ? "\u25B6" : "\u25BC"}</span>
                </div>
            </div>
            <div class="council-ctx-body ${this.collapsed ? "collapsed" : ""}">
                <div class="council-ctx-messages">
                    ${cards}
                </div>
            </div>
        `;

        this.onSelectionChange?.(this.externalHistoryDepth > 0 ? 1 : 0);
    }

    private formatTime(timestamp?: number): string {
        if (!timestamp) return "";
        const d = new Date(timestamp);
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        return `${month}-${day} ${hours}:${minutes}`;
    }

    private renderMessageItem(msg: CouncilMessageItem): string {
        const contentPreview = msg.content.substring(0, 300).replace(/\n/g, " ");
        const promptPreview = msg.userPrompt.substring(0, 100).replace(/\n/g, " ");

        return `
            <div class="council-ctx-item ${msg.selected ? "selected" : ""}" data-id="${msg.id}">
                <div class="council-ctx-item-top">
                    <div class="council-ctx-badge-group">
                        <span class="council-ctx-badge">${this.getModelShortName(msg.modelName)}</span>
                        ${msg.timestamp ? `<span class="council-ctx-time">${this.formatTime(msg.timestamp)}</span>` : ''}
                    </div>
                    <input type="checkbox" class="council-ctx-check" 
                           ${msg.selected ? "checked" : ""} data-id="${msg.id}">
                </div>
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

        this.container.querySelectorAll(".council-ext-limit-check").forEach(el => {
            el.addEventListener("change", (e) => {
                this.limitExternalTokens = (e.target as HTMLInputElement).checked;
            });
        });

        this.container.querySelectorAll(".council-ctx-limit-check").forEach(el => {
            el.addEventListener("change", (e) => {
                this.limitContentLength = (e.target as HTMLInputElement).checked;
            });
        });

        this.container.querySelectorAll(".council-ctx-limit-label").forEach(el => {
            el.addEventListener("click", (e) => {
                e.stopPropagation(); // prevent collapsing injector
            });
        });

        this.container.querySelectorAll(".council-ctx-radio").forEach(el => {
            el.addEventListener("change", (e) => {
                const valstr = (e.target as HTMLInputElement).dataset.historyVal;
                if (valstr !== undefined) {
                    this.externalHistoryDepth = parseInt(valstr, 10);
                    this.render();
                }
            });
        });

        this.container.querySelectorAll(".council-ctx-check").forEach(el => {
            el.addEventListener("change", (e) => {
                if (this.mode === "native") {
                    const id = (e.target as HTMLInputElement).dataset.id;
                    if (id) this.toggleMessage(id);
                }
            });
        });

        this.container.querySelectorAll(".council-ctx-item").forEach(el => {
            el.addEventListener("click", (e) => {
                if ((e.target as HTMLElement).tagName !== "INPUT") {
                    if (this.mode === "native") {
                        const id = (e.currentTarget as HTMLElement).dataset.id;
                        if (id) this.toggleMessage(id);
                    } else {
                        const valstr = (e.currentTarget as HTMLElement).dataset.historyVal;
                        if (valstr !== undefined) {
                            this.externalHistoryDepth = parseInt(valstr, 10);
                            this.render();
                        }
                    }
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
                width: calc(100% - 8px);
                align-self: flex-start;
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

            .council-ctx-limit-label {
                display: flex;
                align-items: center;
                gap: 4px;
                color: var(--gem-sys-color--on-surface-variant, #9aa0a6);
                cursor: pointer;
                margin-right: 8px;
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
                overflow-y: hidden;
                transition: max-height 0.25s ease;
            }
            .council-ctx-body.collapsed {
                max-height: 0;
                overflow: hidden;
            }

            .council-ctx-messages {
                display: flex;
                flex-direction: row;
                gap: 6px;
                padding: 6px 8px;
                overflow-x: auto;
                overflow-y: hidden;
                max-width: 100%;
            }
            
            /* Custom scrollbar for horizontal scrolling */
            .council-ctx-messages::-webkit-scrollbar {
                height: 4px;
            }
            .council-ctx-messages::-webkit-scrollbar-track {
                background: transparent;
            }
            .council-ctx-messages::-webkit-scrollbar-thumb {
                background-color: var(--gem-sys-color--outline-variant, rgba(255,255,255,0.2));
                border-radius: 4px;
            }

            .council-ctx-item {
                display: flex;
                flex-direction: column;
                align-items: flex-start;
                padding: 6px 8px;
                border-radius: 8px;
                cursor: pointer;
                transition: background 0.15s;
                gap: 4px;
                border: 1px solid transparent;
                min-width: 140px;
                max-width: 180px;
                flex-shrink: 0;
            }
            .council-ctx-item:hover {
                background: rgba(255, 255, 255, 0.04);
            }
            .council-ctx-item.selected {
                background: rgba(102, 126, 234, 0.08);
                border-color: rgba(102, 126, 234, 0.2);
            }

            .council-ctx-item-top {
                display: flex;
                align-items: center;
                justify-content: space-between;
                width: 100%;
            }

            .council-ctx-check {
                margin: 0;
                accent-color: #667eea;
                width: 12px;
                height: 12px;
                cursor: pointer;
                flex-shrink: 0;
            }

            .council-ctx-badge-group {
                display: flex;
                align-items: center;
                gap: 5px;
            }

            .council-ctx-time {
                font-size: 9px;
                color: var(--gem-sys-color--on-surface-variant, #9aa0a6);
                opacity: 0.8;
                letter-spacing: 0.2px;
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
                width: 100%;
                display: flex;
                flex-direction: column;
                gap: 2px;
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
                line-height: 1.4;
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                white-space: normal;
                word-wrap: break-word;
            }

            .council-ctx-item-ext {
                flex: 1;
                min-width: 0;
                width: auto;
                max-width: none;
            }
            .council-ctx-item-ext .council-ctx-radio {
                margin: 0;
                accent-color: var(--gem-sys-color--on-surface, #e3e3e3);
                width: 12px;
                height: 12px;
                cursor: pointer;
            }
        `;

        document.head.appendChild(style);
    }
}

export const getContextInjector = ContextInjector.getInstance;
