/**
 * ModelSelector - Custom dropdown menu for model selection
 * Hides Gemini's native model picker and provides a unified interface
 */

interface ModelOption {
    id: string;
    name: string;
    description: string;
}

interface ModelGroup {
    name: string;
    icon: string;
    models: ModelOption[];
}

const MODEL_GROUPS: ModelGroup[] = [
    {
        name: "Gemini",
        icon: "✨",
        models: [
            { id: "gemini-flash", name: "Flash", description: "Fast & efficient" },
            { id: "gemini-thinking", name: "Thinking", description: "Deep reasoning" },
            { id: "gemini-pro", name: "Pro", description: "Advanced" },
        ]
    },
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
            { id: "openai/gpt-5.2-pro", name: "GPT-5.2 Pro", description: "Most advanced" },
            { id: "openai/gpt-5.2", name: "GPT-5.2", description: "Flagship" },
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

export class ModelSelector {
    private container: HTMLElement | null = null;
    private dropdown: HTMLElement | null = null;
    private triggerButton: HTMLElement | null = null;
    private isOpen: boolean = false;
    private activeModel: ModelOption = MODEL_GROUPS[0].models[2]!; // Default: Gemini Pro
    private onModelChange: (model: string) => void;
    private injected: boolean = false;
    private observer: MutationObserver | null = null;

    // Context Management
    private contextToggleContainer: HTMLElement | null = null;
    private contextCheckbox: HTMLInputElement | null = null;
    private contextSizeDisplay: HTMLElement | null = null;
    private isContextLarge: boolean = false;

    constructor(onModelChange: (model: string) => void) {
        this.onModelChange = onModelChange;
        this.injectStyles();
        this.startObserving();
    }

    private injectStyles() {
        if (document.getElementById('gemini-council-styles')) return;

        const style = document.createElement('style');
        style.id = 'gemini-council-styles';
        style.textContent = `
            /* Hide Gemini's native model picker */
            .model-picker-container,
            bard-mode-switcher {
                display: none !important;
            }

            /* Council Selector Container */
            #gemini-council-selector {
                position: relative;
                display: inline-flex;
                align-items: center;
                height: 100%;
                z-index: 1000;
            }

            /* Trigger Button */
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

            /* Context Toggle */
            .council-context-toggle {
                display: none; /* Hidden by default */
                align-items: center;
                gap: 8px;
                margin-right: 12px;
                padding: 4px 8px;
                background: rgba(255, 255, 255, 0.05);
                border-radius: 4px;
                font-size: 11px;
                color: var(--gem-sys-color--on-surface-variant, #9aa0a6);
                border: 1px solid rgba(255, 255, 255, 0.1);
            }

            .council-context-toggle.visible {
                display: flex;
            }

            .council-context-checkbox {
                accent-color: #8ab4f8;
                width: 14px;
                height: 14px;
                cursor: pointer;
            }

            .council-context-label {
                cursor: pointer;
                white-space: nowrap;
            }

            .council-context-size {
                font-size: 10px;
                opacity: 0.7;
                margin-left: 4px;
            }

            /* Dropdown Menu */
            .council-dropdown {
                position: absolute;
                bottom: 100%;
                right: 0;
                margin-bottom: 8px;
                min-width: 220px;
                max-height: 360px;
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
            }

            .council-dropdown.open {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }

            /* Group */
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

            /* Model Option - Horizontal layout */
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
            }

            .council-option-check {
                color: #8ab4f8;
                font-size: 14px;
                margin-left: 8px;
            }

            /* Scrollbar */
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
        `;
        document.head.appendChild(style);
    }

    private startObserving() {
        this.observer = new MutationObserver(() => {
            if (!this.injected || !document.getElementById("gemini-council-selector")) {
                this.injected = false;
                this.tryInject();
            }
        });

        this.observer.observe(document.body, { childList: true, subtree: true });
        this.tryInject();
    }

    private tryInject() {
        // Find the trailing-actions-wrapper where we'll inject
        const trailingActions = document.querySelector('.trailing-actions-wrapper');
        if (trailingActions) {
            this.injectInto(trailingActions as HTMLElement);
            return;
        }

        // Fallback: find model-picker-container's parent
        const modelPicker = document.querySelector('.model-picker-container');
        if (modelPicker && modelPicker.parentElement) {
            this.injectInto(modelPicker.parentElement as HTMLElement);
            return;
        }

        // Fallback: find input-area
        const inputArea = document.querySelector('[data-node-type="input-area"]');
        if (inputArea) {
            const wrapper = inputArea.querySelector('.trailing-actions-wrapper');
            if (wrapper) {
                this.injectInto(wrapper as HTMLElement);
            }
        }
    }

    private injectInto(parent: HTMLElement) {
        if (this.injected || document.getElementById("gemini-council-selector")) return;

        this.container = document.createElement("div");
        this.container.id = "gemini-council-selector";

        // Create context toggle (left of trigger)
        this.contextToggleContainer = document.createElement("div");
        this.contextToggleContainer.className = "council-context-toggle";

        this.contextCheckbox = document.createElement("input");
        this.contextCheckbox.type = "checkbox";
        this.contextCheckbox.className = "council-context-checkbox";
        this.contextCheckbox.id = "council-ctx-check";

        const label = document.createElement("label");
        label.className = "council-context-label";
        label.htmlFor = "council-ctx-check";
        label.innerText = "Attach Full Context";

        this.contextSizeDisplay = document.createElement("span");
        this.contextSizeDisplay.className = "council-context-size";

        this.contextToggleContainer.appendChild(this.contextCheckbox);
        this.contextToggleContainer.appendChild(label);
        this.contextToggleContainer.appendChild(this.contextSizeDisplay);

        // Create trigger button
        this.triggerButton = document.createElement("button");
        this.triggerButton.className = "council-trigger";
        this.updateTriggerButton();
        this.triggerButton.onclick = (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        };

        // Create dropdown
        this.dropdown = this.createDropdown();

        this.container.appendChild(this.contextToggleContainer);
        this.container.appendChild(this.triggerButton);
        this.container.appendChild(this.dropdown);

        // Insert at the beginning (left side)
        parent.insertBefore(this.container, parent.firstChild);

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (this.isOpen && !this.container?.contains(e.target as Node)) {
                this.closeDropdown();
            }
        });

        this.injected = true;
        console.log("Gemini Council: Model selector injected");
    }

    private createDropdown(): HTMLElement {
        const dropdown = document.createElement("div");
        dropdown.className = "council-dropdown";

        MODEL_GROUPS.forEach(group => {
            const groupEl = document.createElement("div");
            groupEl.className = "council-group";

            const header = document.createElement("div");
            header.className = "council-group-header";
            header.innerHTML = `<span>${group.icon}</span><span>${group.name}</span>`;
            groupEl.appendChild(header);

            group.models.forEach(model => {
                const option = document.createElement("div");
                option.className = "council-option";
                if (model.id === this.activeModel.id) {
                    option.classList.add("selected");
                }

                const isSelected = model.id === this.activeModel.id;
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

    private updateTriggerButton() {
        if (!this.triggerButton) return;

        const isGemini = this.activeModel.id.startsWith("gemini");
        const group = MODEL_GROUPS.find(g => g.models.some(m => m.id === this.activeModel.id));
        const icon = group?.icon || "✨";

        this.triggerButton.className = `council-trigger ${this.isOpen ? 'open' : ''} ${!isGemini ? 'external' : ''}`;
        this.triggerButton.innerHTML = `
            <span class="council-trigger-icon">${icon}</span>
            <span>${this.activeModel.name}</span>
            <span class="council-trigger-arrow">▼</span>
        `;

        // Show/hide context toggle based on model and context size
        if (this.contextToggleContainer) {
            if (!this.isExternalModel() || !this.isContextLarge) {
                this.contextToggleContainer.classList.remove("visible");
            } else {
                this.contextToggleContainer.classList.add("visible");
            }
        }
    }

    private toggleDropdown() {
        if (this.isOpen) {
            this.closeDropdown();
        } else {
            this.openDropdown();
        }
    }

    private openDropdown() {
        this.isOpen = true;
        this.dropdown?.classList.add("open");
        this.updateTriggerButton();
    }

    private closeDropdown() {
        this.isOpen = false;
        this.dropdown?.classList.remove("open");
        this.updateTriggerButton();
    }

    private selectModel(group: ModelGroup, model: ModelOption) {
        this.activeModel = model;
        this.onModelChange(model.id);
        this.closeDropdown();
        this.updateTriggerButton();

        // Rebuild dropdown to update selected state
        if (this.dropdown && this.container) {
            const newDropdown = this.createDropdown();
            this.container.replaceChild(newDropdown, this.dropdown);
            this.dropdown = newDropdown;
        }

        console.log("Gemini Council: Selected model:", model.id);
    }

    public getActiveModel(): string {
        return this.activeModel.id;
    }

    public getActiveModelName(): string {
        return this.activeModel.name;
    }

    public isExternalModel(): boolean {
        return !this.activeModel.id.startsWith("gemini");
    }

    public setContextSize(tokens: number, threshold: number) {
        this.isContextLarge = tokens > threshold;

        if (this.contextSizeDisplay) {
            this.contextSizeDisplay.innerText = `(~${Math.round(tokens / 1000)}k tok)`;
        }

        this.updateTriggerButton();
    }

    public shouldAttachContext(): boolean {
        // If context is small, attach by default for external models
        if (!this.isContextLarge) return true;
        // If large, check the box
        return this.contextCheckbox?.checked || false;
    }

    public destroy() {
        this.observer?.disconnect();
        this.container?.remove();
        document.getElementById('gemini-council-styles')?.remove();
        this.injected = false;
    }
}
