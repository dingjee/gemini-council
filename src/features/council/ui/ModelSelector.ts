/**
 * ModelSelector - Custom dropdown menu for model selection
 * Preserves Gemini's native model picker and extends with external models
 */

import { SyncIndicator } from "./SyncIndicator";

interface ModelOption {
    id: string;
    name: string;
    description: string;
    isNative?: boolean;
}

interface ModelGroup {
    name: string;
    icon: string;
    models: ModelOption[];
    isNative?: boolean;
}

const EXTERNAL_MODEL_GROUPS: ModelGroup[] = [
    {
        name: "Claude",
        icon: "🎭",
        models: [
            { id: "anthropic/claude-opus-4-6", name: "Opus 4.6", description: "Latest flagship" },
            { id: "anthropic/claude-opus-4-5-20251101", name: "Opus 4.5", description: "Powerful" },
        ]
    },
    {
        name: "OpenAI",
        icon: "🤖",
        models: [
            { id: "openai/gpt-5.4-thinking", name: "GPT-5.4 Thinking", description: "Deep reasoning" },
            { id: "openai/gpt-5.4-pro", name: "GPT-5.4 Pro", description: "Most advanced" },
            { id: "openai/gpt-5.4", name: "GPT-5.4", description: "Flagship" },
        ]
    },
    {
        name: "DeepSeek",
        icon: "🔮",
        models: [
            { id: "deepseek/deepseek-r1", name: "R1", description: "Reasoning" },
        ]
    }
];

const NATIVE_MODEL_ID_PREFIX = "gemini-native-";
const DEBUG_MODEL_SELECTOR = true;

function debugLog(...args: unknown[]) {
    if (DEBUG_MODEL_SELECTOR) {
        console.log('[ModelSelector]', ...args);
    }
}

export class ModelSelector {
    private container: HTMLElement | null = null;
    private dropdown: HTMLElement | null = null;
    private triggerButton: HTMLElement | null = null;
    private isOpen: boolean = false;
    private activeModel: ModelOption | null = null;
    private onModelChange: (model: string) => void;
    private injected: boolean = false;
    private observer: MutationObserver | null = null;

    private nativeGeminiModels: ModelOption[] = [];
    private hasScannedPopup: boolean = false;
    private nativeModelPicker: HTMLElement | null = null;
    private lastNativeModelText: string = "";

    private contextToggleContainer: HTMLElement | null = null;
    private contextCheckbox: HTMLInputElement | null = null;
    private contextSizeDisplay: HTMLElement | null = null;
    private contextIconBtn: HTMLButtonElement | null = null;
    private isContextLarge: boolean = false;
    private hasCouncilContent: boolean = false;
    private councilMessageCount: number = 0;

    private syncIndicator: SyncIndicator | null = null;
    public onContextToggleClick?: (active: boolean) => void;

    constructor(onModelChange: (model: string) => void) {
        this.onModelChange = onModelChange;
        this.injectStyles();
        this.startObserving();
        debugLog('Initialized');
    }

    private injectStyles() {
        if (document.getElementById('gemini-council-styles')) return;

        const style = document.createElement('style');
        style.id = 'gemini-council-styles';
        style.textContent = `
            #gemini-council-selector {
                position: relative;
                display: inline-flex;
                align-items: center;
                height: 100%;
                z-index: 1000;
            }

            .council-trigger {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 6px 12px;
                border: none;
                border-radius: 18px;
                background: transparent;
                color: var(--gem-sys-color--on-surface, #e3e3e3);
                font-family: 'Google Sans', Roboto, sans-serif;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: background-color 0.2s;
            }

            .council-trigger:hover {
                background: rgba(255, 255, 255, 0.08);
            }

            .council-trigger.active {
                background: rgba(138, 180, 248, 0.15);
            }

            .council-trigger.external {
                background: rgba(76, 175, 80, 0.15);
                color: #81c784;
            }

            .council-trigger-icon {
                font-size: 16px;
            }

            .council-trigger-arrow {
                font-size: 10px;
                transition: transform 0.2s;
            }

            .council-trigger.open .council-trigger-arrow {
                transform: rotate(180deg);
            }

            .council-context-toggle {
                display: none;
                align-items: center;
                position: relative;
                margin-right: 4px;
            }

            .council-context-toggle.visible {
                display: flex;
            }

            .council-context-checkbox {
                display: none;
            }

            .council-context-icon-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                border: none;
                background: transparent;
                color: var(--gem-sys-color--on-surface-variant, #9aa0a6);
                cursor: pointer;
                transition: all 0.2s;
                position: relative;
            }
            .council-context-icon-btn:hover {
                background: rgba(255, 255, 255, 0.08);
            }
            .council-context-icon-btn.active {
                color: #8ab4f8;
                background: rgba(138, 180, 248, 0.12);
            }
            .council-context-icon-btn svg {
                width: 18px;
                height: 18px;
            }

            .council-context-badge {
                position: absolute;
                top: 2px;
                right: 2px;
                min-width: 14px;
                height: 14px;
                background: #8ab4f8;
                color: #1a1a2e;
                border-radius: 7px;
                font-size: 9px;
                font-weight: 600;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 0 3px;
                line-height: 1;
            }

            .council-dropdown {
                position: fixed;
                min-width: 220px;
                max-width: 320px;
                max-height: 60vh;
                overflow-y: auto;
                background: var(--gem-sys-color--surface-container-high, #2b2b2b);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 12px;
                box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                opacity: 0;
                visibility: hidden;
                transform: translateY(8px);
                transition: all 0.2s ease;
                font-family: 'Google Sans', Roboto, sans-serif;
                z-index: 10001;
            }

            .council-dropdown.open {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }

            .native-model-picker-hidden {
                display: none !important;
            }

            .council-group {
                padding: 6px 0;
                border-bottom: 1px solid rgba(255, 255, 255, 0.08);
            }

            .council-group:last-child {
                border-bottom: none;
            }

            .council-group-header {
                display: flex;
                align-items: center;
                gap: 6px;
                padding: 4px 12px;
                font-size: 11px;
                font-weight: 500;
                color: rgba(255, 255, 255, 0.5);
                text-transform: uppercase;
                letter-spacing: 0.5px;
            }

            .council-option {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 8px 12px;
                cursor: pointer;
                transition: background-color 0.15s;
            }

            .council-option:hover {
                background: rgba(255, 255, 255, 0.08);
            }

            .council-option.selected {
                background: rgba(138, 180, 248, 0.15);
            }

            .council-option-left {
                display: flex;
                align-items: center;
                gap: 8px;
            }

            .council-option-name {
                font-family: 'Google Sans', Roboto, sans-serif;
                font-size: 13px;
                font-weight: 500;
                color: var(--gem-sys-color--on-surface, #e3e3e3);
            }

            .council-option-desc {
                font-family: 'Google Sans', Roboto, sans-serif;
                font-size: 11px;
                color: rgba(255, 255, 255, 0.4);
                max-width: 150px;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }

            .council-option-check {
                color: #8ab4f8;
                font-size: 14px;
                margin-left: 8px;
            }

            .council-dropdown::-webkit-scrollbar {
                width: 6px;
            }

            .council-dropdown::-webkit-scrollbar-track {
                background: transparent;
            }

            .council-dropdown::-webkit-scrollbar-thumb {
                background: rgba(255, 255, 255, 0.2);
                border-radius: 3px;
            }

            .council-sync-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                border: none;
                background: transparent;
                color: var(--gem-sys-color--on-surface-variant, #9aa0a6);
                cursor: pointer;
                transition: all 0.2s;
                margin-right: 8px;
            }
            .council-sync-btn:hover { background: rgba(255, 255, 255, 0.08); color: var(--gem-sys-color--on-surface, #e3e3e3); }
            
            .council-sync-btn.disconnected { opacity: 0.5; }
            .council-sync-btn.syncing { color: #8ab4f8; animation: spin 1s linear infinite; }
            .council-sync-btn.synced { color: #81c784; }
            .council-sync-btn.error { color: #f44336; }
            .council-sync-btn.loading .spinner { animation: spin 1s linear infinite; }

            @keyframes spin { 100% { transform: rotate(360deg); } }

            .council-toast {
                position: fixed;
                bottom: 24px;
                left: 50%;
                transform: translateX(-50%) translateY(20px);
                background: #333;
                color: #fff;
                padding: 12px 24px;
                border-radius: 24px;
                font-size: 14px;
                opacity: 0;
                transition: all 0.3s;
                z-index: 10000;
                box-shadow: 0 4px 12px rgba(0,0,0,0.3);
            }
            .council-toast.visible {
                opacity: 1;
                transform: translateX(-50%) translateY(0);
            }
        `;
        document.head.appendChild(style);
    }

    private startObserving() {
        this.observer = new MutationObserver(() => {
            this.scanNativeModelPicker();
            if (!this.injected || !document.getElementById("gemini-council-selector")) {
                this.injected = false;
                this.tryInject();
            }
        });

        this.observer.observe(document.body, { childList: true, subtree: true });
        this.tryInject();
    }

    private scanNativeModelPicker(): void {
        const modelPicker = document.querySelector('.model-picker-container') as HTMLElement;
        if (!modelPicker) {
            return;
        }

        if (this.nativeModelPicker === modelPicker) {
            return;
        }

        this.nativeModelPicker = modelPicker;
        debugLog('Found model-picker-container');

        const currentModelBtn = modelPicker.querySelector('button[aria-haspopup="menu"], button[aria-haspopup="listbox"]');
        if (currentModelBtn) {
            const modelText = this.extractModelNameFromButton(currentModelBtn);
            if (modelText && modelText !== this.lastNativeModelText) {
                debugLog('Current model button text:', modelText);
                this.lastNativeModelText = modelText;
                if (!this.activeModel || this.activeModel.isNative) {
                    this.activeModel = {
                        id: NATIVE_MODEL_ID_PREFIX + this.sanitizeModelId(modelText),
                        name: modelText,
                        description: "Native",
                        isNative: true
                    };
                    this.updateTriggerButton();
                }
            }
        }
    }

    private extractNativeModels(picker: HTMLElement): ModelOption[] {
        const models: ModelOption[] = [];
        const seenTexts = new Set<string>();

        const selectors = [
            '.mat-mdc-menu-item',
            'button[role="menuitemradio"]',
            'button[role="option"]',
            '[role="option"] button',
            'li button',
            '[data-value]',
            'mat-option',
            '.mat-option',
            '[role="listbox"] button',
            '.model-option'
        ];

        for (const selector of selectors) {
            const elements = picker.querySelectorAll(selector);
            elements.forEach((el) => {
                const modeTitle = el.querySelector('.mode-title');
                const text = modeTitle ? modeTitle.textContent?.trim() : el.textContent?.trim();
                const cleanText = text?.split('\n')[0]?.trim();

                if (cleanText && cleanText.length > 0 && cleanText.length < 50 && !seenTexts.has(cleanText) && !cleanText.includes('aria-')) {
                    seenTexts.add(cleanText);
                    models.push({
                        id: NATIVE_MODEL_ID_PREFIX + this.sanitizeModelId(cleanText),
                        name: cleanText,
                        description: "Native",
                        isNative: true
                    });
                }
            });
        }

        if (models.length === 0) {
            const allButtons = picker.querySelectorAll('button');
            allButtons.forEach((btn) => {
                const modeTitle = btn.querySelector('.mode-title');
                const text = modeTitle ? modeTitle.textContent?.trim() : btn.textContent?.trim();
                const cleanText = text?.split('\n')[0]?.trim();

                if (cleanText && cleanText.length > 0 && cleanText.length < 50 && !seenTexts.has(cleanText) && !cleanText.includes("aria-")) {
                    seenTexts.add(cleanText);
                    models.push({
                        id: NATIVE_MODEL_ID_PREFIX + this.sanitizeModelId(cleanText),
                        name: cleanText,
                        description: "Native",
                        isNative: true
                    });
                }
            });
        }

        return models;
    }

    private async fetchNativeModels(): Promise<ModelOption[]> {
        if (this.hasScannedPopup && this.nativeGeminiModels.length > 0) {
            debugLog('Returning cached models:', this.nativeGeminiModels);
            return this.nativeGeminiModels;
        }

        if (!this.nativeModelPicker) {
            this.scanNativeModelPicker();
        }

        debugLog('Fetching native models, picker:', this.nativeModelPicker);

        if (this.nativeModelPicker) {
            const triggerBtn = this.nativeModelPicker.querySelector('button[aria-haspopup="menu"], button[aria-haspopup="listbox"]') as HTMLElement;
            debugLog('Trigger button:', triggerBtn);

            if (triggerBtn) {
                triggerBtn.click();
                debugLog('Clicked trigger button, waiting for menu...');

                await new Promise(resolve => setTimeout(resolve, 500));

                const overlaySelectors = [
                    '.cdk-overlay-connected-position-bounding-box',
                    '.cdk-overlay-container',
                    '.cdk-overlay-pane'
                ];

                let overlayContainer: Element | null = null;
                for (const selector of overlaySelectors) {
                    overlayContainer = document.querySelector(selector);
                    if (overlayContainer) {
                        debugLog('Found overlay with selector:', selector);
                        break;
                    }
                }

                debugLog('Overlay container:', overlayContainer);

                if (overlayContainer) {
                    debugLog('Overlay container HTML:', overlayContainer.innerHTML.substring(0, 800));
                }

                const menuSelectors = [
                    '.mat-mdc-menu-content',
                    '.cdk-overlay-pane .mat-mdc-menu-content',
                    '[role="menu"]',
                    '.mat-mdc-menu-panel',
                    '.gds-mode-switch-menu'
                ];

                let menuContent: Element | null = null;
                for (const selector of menuSelectors) {
                    menuContent = document.querySelector(selector);
                    if (menuContent) {
                        debugLog('Found menu with selector:', selector);
                        break;
                    }
                }

                debugLog('Menu content:', menuContent);

                if (menuContent) {
                    const allButtons = menuContent.querySelectorAll('button.bard-mode-list-button, button[role="menuitemradio"], button');
                    debugLog('All buttons in menu:', allButtons.length);

                    allButtons.forEach((btn, index) => {
                        const modeTitle = btn.querySelector('.mode-title');
                        const modeDesc = btn.querySelector('.mode-desc');

                        let name = '';
                        let desc = 'Native';

                        if (modeTitle) {
                            name = modeTitle.textContent?.trim() || '';
                        }
                        if (modeDesc) {
                            desc = modeDesc.textContent?.trim() || 'Native';
                        }

                        debugLog(`Button ${index}:`, {
                            hasModeTitle: !!modeTitle,
                            name,
                            desc,
                            className: btn.className.substring(0, 50)
                        });

                        if (name && name.length > 0 && name.length < 50) {
                            const modelId = NATIVE_MODEL_ID_PREFIX + this.sanitizeModelId(name);
                            if (!this.nativeGeminiModels.some(m => m.id === modelId)) {
                                this.nativeGeminiModels.push({
                                    id: modelId,
                                    name: name,
                                    description: desc,
                                    isNative: true
                                });
                                debugLog('Added model:', name, desc);
                            }
                        }
                    });
                }

                const closeBtn = document.querySelector('.cdk-overlay-backdrop') as HTMLElement;
                if (closeBtn) {
                    debugLog('Closing menu via backdrop');
                    closeBtn.click();
                } else {
                    debugLog('Closing menu via trigger button');
                    triggerBtn.click();
                }

                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }

        this.hasScannedPopup = true;
        debugLog('Final models list:', this.nativeGeminiModels);
        return this.nativeGeminiModels.length > 0 ? this.nativeGeminiModels : this.getDefaultGeminiModels();
    }

    private sanitizeModelId(text: string): string {
        return text.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    }

    private extractModelNameFromButton(button: Element | null): string {
        if (!button) return "";
        const firstSpan = button.querySelector('span');
        if (firstSpan) {
            const innerSpan = firstSpan.querySelector('span');
            if (innerSpan && innerSpan.textContent) {
                return innerSpan.textContent.trim();
            }
            if (firstSpan.textContent) {
                return firstSpan.textContent.trim().split('\n')[0].trim();
            }
        }
        const text = button.textContent?.trim() || "";
        return text.split('\n')[0].trim();
    }

    private tryInject() {
        this.scanNativeModelPicker();

        debugLog('tryInject - nativeModelPicker:', !!this.nativeModelPicker, 'injected:', this.injected);

        if (this.nativeModelPicker && this.nativeModelPicker.parentElement) {
            if (this.injected && this.container && this.container.parentElement !== this.nativeModelPicker.parentElement) {
                debugLog('Moving selector to beside native picker');
                this.nativeModelPicker.parentElement.insertBefore(this.container, this.nativeModelPicker.nextSibling);
            }
            if (this.injected) {
                // Always re-hide: Angular may re-render the native picker without our hidden class
                this.hideNativePicker();
            } else {
                this.injectBesideNativePicker();
            }
            return;
        }

        if (this.injected) return;

        const trailingActions = document.querySelector('.trailing-actions-wrapper');
        debugLog('tryInject - trailingActions:', !!trailingActions);
        if (trailingActions) {
            this.injectInto(trailingActions as HTMLElement);
            return;
        }

        const inputArea = document.querySelector('[data-node-type="input-area"]');
        debugLog('tryInject - inputArea:', !!inputArea);
        if (inputArea) {
            const wrapper = inputArea.querySelector('.trailing-actions-wrapper');
            if (wrapper) {
                this.injectInto(wrapper as HTMLElement);
            }
        }
    }

    private createContextToggle() {
        this.contextToggleContainer = document.createElement("div");
        this.contextToggleContainer.className = "council-context-toggle";

        // Hidden checkbox for state
        this.contextCheckbox = document.createElement("input");
        this.contextCheckbox.type = "checkbox";
        this.contextCheckbox.className = "council-context-checkbox";
        this.contextCheckbox.id = "council-ctx-check";

        // Icon button
        this.contextIconBtn = document.createElement("button");
        this.contextIconBtn.className = "council-context-icon-btn";
        this.contextIconBtn.title = "附带 Council 上下文";
        this.contextIconBtn.type = "button";
        this.contextIconBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
            </svg>
        `;

        // Badge for message count
        this.contextSizeDisplay = document.createElement("span");
        this.contextSizeDisplay.className = "council-context-badge";
        this.contextSizeDisplay.style.display = "none";

        this.contextIconBtn.appendChild(this.contextSizeDisplay);

        this.contextIconBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (this.contextCheckbox) {
                this.contextCheckbox.checked = !this.contextCheckbox.checked;
                this.contextIconBtn?.classList.toggle("active", this.contextCheckbox.checked);
                this.onContextToggleClick?.(this.contextCheckbox.checked);
            }
        });

        this.contextToggleContainer.appendChild(this.contextCheckbox);
        this.contextToggleContainer.appendChild(this.contextIconBtn);
    }

    private injectBesideNativePicker() {
        if (this.injected || !this.nativeModelPicker) return;

        // Remove stale element from previous extension session (no JS backing)
        const staleEl = document.getElementById("gemini-council-selector");
        if (staleEl && staleEl !== this.container) {
            debugLog('Removing stale council-selector element');
            staleEl.remove();
        }

        debugLog('injectBesideNativePicker called');
        this.hideNativePicker();

        this.container = document.createElement("div");
        this.container.id = "gemini-council-selector";

        this.createContextToggle();

        this.syncIndicator = new SyncIndicator();
        this.container.appendChild(this.syncIndicator.getElement());

        this.triggerButton = document.createElement("button");
        this.triggerButton.className = "council-trigger";
        this.updateTriggerButton();

        this.triggerButton.addEventListener('click', (e) => {
            debugLog('Trigger button clicked!');
            e.stopPropagation();
            e.preventDefault();
            this.toggleDropdown();
        });

        this.container.appendChild(this.contextToggleContainer);
        this.container.appendChild(this.triggerButton);

        if (!this.nativeModelPicker.parentElement) return;
        this.nativeModelPicker.parentElement.insertBefore(this.container, this.nativeModelPicker.nextSibling);

        this.initializeActiveModel();

        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.container?.contains(e.target as Node) && !this.dropdown?.contains(e.target as Node)) {
                this.closeDropdown();
            }
        });

        this.injected = true;
        debugLog('Model selector injected beside native picker');
    }

    private injectInto(parent: HTMLElement) {
        if (this.injected) return;

        // Remove stale element from previous extension session
        const staleEl = document.getElementById("gemini-council-selector");
        if (staleEl && staleEl !== this.container) {
            debugLog('Removing stale council-selector element');
            staleEl.remove();
        }

        debugLog('injectInto called, parent:', parent.className);

        this.container = document.createElement("div");
        this.container.id = "gemini-council-selector";

        this.createContextToggle();

        this.syncIndicator = new SyncIndicator();
        this.container.appendChild(this.syncIndicator.getElement());

        this.triggerButton = document.createElement("button");
        this.triggerButton.className = "council-trigger";
        this.updateTriggerButton();

        this.triggerButton.addEventListener('click', (e) => {
            debugLog('Trigger button clicked!');
            e.stopPropagation();
            e.preventDefault();
            this.toggleDropdown();
        });

        this.container.appendChild(this.contextToggleContainer);
        this.container.appendChild(this.triggerButton);

        parent.insertBefore(this.container, parent.firstChild);

        this.initializeActiveModel();

        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.container?.contains(e.target as Node) && !this.dropdown?.contains(e.target as Node)) {
                this.closeDropdown();
            }
        });

        this.injected = true;
        debugLog('Model selector injected into', parent.className);
    }

    private createDropdown(): HTMLElement {
        const dropdown = document.createElement("div");
        dropdown.className = "council-dropdown";

        const nativeGroup: ModelGroup = {
            name: "Gemini",
            icon: "✨",
            models: this.nativeGeminiModels.length > 0 ? this.nativeGeminiModels : this.getDefaultGeminiModels(),
            isNative: true
        };

        const allGroups = [nativeGroup, ...EXTERNAL_MODEL_GROUPS];

        allGroups.forEach(group => {
            const groupEl = document.createElement("div");
            groupEl.className = "council-group";

            const header = document.createElement("div");
            header.className = "council-group-header";
            header.innerHTML = `<span>${group.icon}</span><span>${group.name}</span>`;
            groupEl.appendChild(header);

            group.models.forEach(model => {
                const option = document.createElement("div");
                option.className = "council-option";
                if (this.activeModel && model.id === this.activeModel.id) {
                    option.classList.add("selected");
                }

                const isSelected = this.activeModel && model.id === this.activeModel.id;
                option.innerHTML = `
                    <div class="council-option-left">
                        <span class="council-option-name">${model.name}</span>
                        <span class="council-option-desc">${model.description}</span>
                    </div>
                    ${isSelected ? '<span class="council-option-check">✓</span>' : ''}
                `;

                option.onclick = (e) => {
                    e.stopPropagation();
                    this.selectModel(group, model);
                };

                groupEl.appendChild(option);
            });

            dropdown.appendChild(groupEl);
        });

        return dropdown;
    }

    private getDefaultGeminiModels(): ModelOption[] {
        return [
            { id: NATIVE_MODEL_ID_PREFIX + "flash", name: "Flash", description: "Native", isNative: true },
            { id: NATIVE_MODEL_ID_PREFIX + "pro", name: "Pro", description: "Native", isNative: true },
        ];
    }

    private initializeActiveModel() {
        if (this.activeModel) return;

        if (this.lastNativeModelText) {
            this.activeModel = {
                id: NATIVE_MODEL_ID_PREFIX + this.sanitizeModelId(this.lastNativeModelText),
                name: this.lastNativeModelText,
                description: "Native",
                isNative: true
            };
        } else {
            const currentModelBtn = this.nativeModelPicker?.querySelector('button[aria-haspopup="menu"], button[aria-haspopup="listbox"]');
            const modelText = this.extractModelNameFromButton(currentModelBtn);
            if (modelText) {
                this.activeModel = {
                    id: NATIVE_MODEL_ID_PREFIX + this.sanitizeModelId(modelText),
                    name: modelText,
                    description: "Native",
                    isNative: true
                };
                this.lastNativeModelText = modelText;
            }
        }

        this.updateTriggerButton();
    }

    private updateTriggerButton() {
        if (!this.triggerButton) return;

        const isExternal = this.activeModel && !this.activeModel.isNative;
        const icon = isExternal ? this.getGroupIcon(this.activeModel!.id) : "✨";
        const modelName = this.activeModel?.name || "Gemini";

        this.triggerButton.className = `council-trigger ${this.isOpen ? 'open' : ''} ${isExternal ? 'external' : ''}`;
        this.triggerButton.innerHTML = `
            <span class="council-trigger-icon">${icon}</span>
            <span>${modelName}</span>
            <span class="council-trigger-arrow">▼</span>
        `;

        if (this.contextToggleContainer) {
            // Show the context toggle whenever council content exists, regardless of active model
            debugLog('Context toggle:', { hasCouncilContent: this.hasCouncilContent });
            if (this.hasCouncilContent) {
                this.contextToggleContainer.classList.add("visible");
            } else {
                this.contextToggleContainer.classList.remove("visible");
            }
        }
    }

    private getGroupIcon(modelId: string): string {
        for (const group of EXTERNAL_MODEL_GROUPS) {
            if (group.models.some(m => m.id === modelId)) {
                return group.icon;
            }
        }
        return "🤖";
    }

    private toggleDropdown() {
        debugLog('toggleDropdown called, isOpen:', this.isOpen);
        if (this.isOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }

    private async openDropdown() {
        debugLog('openDropdown called');
        this.hideNativePicker();

        if (this.dropdown) {
            this.dropdown.remove();
        }

        debugLog('Calling fetchNativeModels...');
        await this.fetchNativeModels();
        debugLog('fetchNativeModels completed');

        this.dropdown = this.createDropdown();
        this.dropdown.style.visibility = 'hidden';
        document.body.appendChild(this.dropdown);

        this.positionDropdown();

        this.isOpen = true;
        this.dropdown.style.visibility = 'visible';
        this.dropdown.classList.add("open");
        this.updateTriggerButton();
    }

    private positionDropdown() {
        if (!this.dropdown || !this.triggerButton) return;

        const triggerRect = this.triggerButton.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const dropdownHeight = this.dropdown.offsetHeight;

        let top: number;
        const spaceAbove = triggerRect.top;
        const spaceBelow = viewportHeight - triggerRect.bottom;

        if (spaceAbove >= dropdownHeight + 16 || spaceAbove > spaceBelow) {
            top = triggerRect.top - dropdownHeight - 8;
            if (top < 10) {
                top = 10;
            }
        } else {
            top = triggerRect.bottom + 8;
        }

        let left = triggerRect.right - this.dropdown.offsetWidth;
        if (left < 10) {
            left = 10;
        }

        if (left + this.dropdown.offsetWidth > window.innerWidth - 10) {
            left = window.innerWidth - this.dropdown.offsetWidth - 10;
        }

        this.dropdown.style.top = `${top}px`;
        this.dropdown.style.left = `${left}px`;

        const maxVisibleHeight = viewportHeight - top - 16;
        if (dropdownHeight > maxVisibleHeight) {
            this.dropdown.style.maxHeight = `${Math.max(200, maxVisibleHeight)}px`;
        }
    }

    private hideNativePicker() {
        if (this.nativeModelPicker) {
            this.nativeModelPicker.classList.add('native-model-picker-hidden');
        }
    }

    private showNativePicker() {
        if (this.nativeModelPicker) {
            this.nativeModelPicker.classList.remove('native-model-picker-hidden');
        }
    }

    private closeDropdown() {
        this.isOpen = false;
        if (this.dropdown) {
            this.dropdown.classList.remove("open");
            this.dropdown.remove();
            this.dropdown = null;
        }
        this.updateTriggerButton();
    }

    private selectModel(group: ModelGroup, model: ModelOption) {
        this.activeModel = model;
        this.closeDropdown();

        if (model.isNative) {
            this.triggerNativeModelSelection(model.name);
        }

        // Always notify content.ts on model change (native or external)
        this.onModelChange(model.id);
    }

    private triggerNativeModelSelection(modelName: string): void {
        if (!this.nativeModelPicker) {
            this.scanNativeModelPicker();
        }

        if (this.nativeModelPicker) {
            const triggerBtn = this.nativeModelPicker.querySelector('button[aria-haspopup="listbox"]') as HTMLElement;
            if (triggerBtn) {
                triggerBtn.click();

                setTimeout(() => {
                    const options = this.nativeModelPicker!.querySelectorAll('button[role="option"], li button, [data-value]');
                    for (const opt of options) {
                        if (opt.textContent?.includes(modelName)) {
                            (opt as HTMLElement).click();
                            break;
                        }
                    }
                }, 100);
            }
        }
    }

    public getActiveModel(): string {
        if (this.activeModel?.isNative) {
            return this.activeModel.name.toLowerCase();
        }
        return this.activeModel?.id || "";
    }

    public getActiveModelName(): string {
        return this.activeModel?.name || "Unknown";
    }

    public isExternalModel(): boolean {
        return this.activeModel ? !this.activeModel.isNative : false;
    }

    public setContextSize(tokens: number, threshold: number) {
        this.isContextLarge = tokens > threshold;

        if (this.contextSizeDisplay) {
            this.contextSizeDisplay.innerText = `(~${Math.round(tokens / 1000)}k tok)`;
        }

        this.updateTriggerButton();
    }

    public setHasCouncilContent(has: boolean, count: number | string = 0) {
        this.hasCouncilContent = has;
        this.councilMessageCount = typeof count === 'number' ? count : 1;

        const isActive = count !== 0 && count !== '0' && count !== '';

        if (this.contextSizeDisplay) {
            if (isActive) {
                this.contextSizeDisplay.textContent = String(count);
                this.contextSizeDisplay.style.display = "flex";
                this.setCouncilContextChecked(true);
            } else {
                this.contextSizeDisplay.style.display = "none";
                this.setCouncilContextChecked(false);
            }
        }
        this.updateTriggerButton();
    }

    public shouldAttachCouncilContext(): boolean {
        return this.contextCheckbox?.checked || false;
    }

    public setCouncilContextChecked(checked: boolean): void {
        if (this.contextCheckbox) {
            this.contextCheckbox.checked = checked;
            this.contextIconBtn?.classList.toggle("active", checked);
        }
    }

    /** Whether to attach native Gemini chat history to external model queries */
    public shouldAttachChatHistory(): boolean {
        if (!this.isContextLarge) return true;
        // For large contexts, could add a separate control later; for now always true
        return true;
    }

    public destroy() {
        this.showNativePicker();
        this.syncIndicator?.destroy();
        this.observer?.disconnect();
        this.container?.remove();
        if (this.dropdown) {
            this.dropdown.remove();
            this.dropdown = null;
        }
        document.getElementById('gemini-council-styles')?.remove();
        this.injected = false;
    }
}
