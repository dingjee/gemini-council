import { domService } from '@/core/services/DOMService';
import { logger } from '@/core/services/LoggerService';
import './sidecar.css';

export class SidecarUI {
    private container: HTMLElement | null = null;
    private outputArea: HTMLElement | null = null;
    private modelSelect: HTMLSelectElement | null = null;
    private apiKeyInput: HTMLInputElement | null = null;
    private logger = logger.createChild('SidecarUI');

    private isVisible = false;

    constructor() {
        this.inject();
    }

    private inject() {
        if (document.getElementById('gemini-council-container')) return;

        // Create Main Container
        this.container = document.createElement('div');
        this.container.id = 'gemini-council-container';
        this.container.className = 'hidden'; // Start hidden

        // Header
        const header = document.createElement('div');
        header.className = 'council-header';
        header.innerHTML = `
      <div class="council-title">
        <span>⚖️ Council of Models</span>
      </div>
      <button id="council-close-btn" style="background:none;border:none;color:#aaa;cursor:pointer">✕</button>
    `;

        // Controls
        const controls = document.createElement('div');
        controls.className = 'council-controls';

        // Model Selector
        this.modelSelect = document.createElement('select');
        this.modelSelect.className = 'council-select';
        const models = [
            { id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet' },
            { id: 'openai/gpt-4o', name: 'GPT-4o' },
            { id: 'google/gemini-pro-1.5', name: 'Gemini Pro 1.5' },
            { id: 'deepseek/deepseek-r1', name: 'DeepSeek R1' }
        ];
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            this.modelSelect?.appendChild(opt);
        });

        // API Key Input
        this.apiKeyInput = document.createElement('input');
        this.apiKeyInput.type = 'password';
        this.apiKeyInput.className = 'council-apikey-input';
        this.apiKeyInput.placeholder = 'OpenRouter API Key';

        // Ask Button
        const askBtn = document.createElement('button');
        askBtn.id = 'council-ask-btn';
        askBtn.textContent = 'Ask Council ⚖️';
        askBtn.onclick = () => this.handleAskClick();
        askBtn.style.cssText = `
      width: 100%;
      padding: 10px;
      margin-top: 10px;
      background: #1a73e8;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
    `;

        controls.appendChild(this.modelSelect);
        controls.appendChild(this.apiKeyInput);
        controls.appendChild(askBtn);

        // Output Area
        this.outputArea = document.createElement('div');
        this.outputArea.className = 'council-output';
        this.outputArea.innerHTML = '<p style="color:#666;text-align:center;margin-top:20px">Select a model requesting a second opinion...</p>';

        // Assemble
        this.container.appendChild(header);
        this.container.appendChild(controls);
        this.container.appendChild(this.outputArea);

        document.body.appendChild(this.container);

        // Event Listeners
        header.querySelector('#council-close-btn')?.addEventListener('click', () => this.toggle(false));
        this.apiKeyInput.addEventListener('change', (e) => this.saveApiKey((e.target as HTMLInputElement).value));
        this.modelSelect.addEventListener('change', (e) => this.saveModel((e.target as HTMLSelectElement).value));

        // Restore Settings
        this.restoreSettings();
    }

    public toggle(force?: boolean) {
        this.isVisible = force !== undefined ? force : !this.isVisible;
        if (this.isVisible) {
            this.container?.classList.remove('hidden');
            this.adjustGeminiLayout(true);
        } else {
            this.container?.classList.add('hidden');
            this.adjustGeminiLayout(false);
        }
    }

    public updateOutput(htmlContent: string) {
        if (this.outputArea) {
            this.outputArea.innerHTML = htmlContent;
        }
    }

    public setLoading(isLoading: boolean) {
        if (this.outputArea) {
            if (isLoading) {
                this.outputArea.innerHTML = '<div style="text-align:center;padding:20px">Thinking...</div>';
            }
        }
    }

    public getSettings() {
        return {
            apiKey: this.apiKeyInput?.value || '',
            modelId: this.modelSelect?.value || 'anthropic/claude-3.5-sonnet'
        };
    }

    private async saveApiKey(key: string) {
        await chrome.storage.local.set({ 'council_apikey': key });
    }

    private async saveModel(modelId: string) {
        await chrome.storage.local.set({ 'council_model': modelId });
    }

    private async restoreSettings() {
        const data = await chrome.storage.local.get(['council_apikey', 'council_model']);
        if (data.council_apikey && this.apiKeyInput) {
            this.apiKeyInput.value = data.council_apikey;
        }
        if (data.council_model && this.modelSelect) {
            this.modelSelect.value = data.council_model;
        }
    }

    public onAsk: (() => void) | null = null;

    private handleAskClick() {
        if (this.onAsk) {
            this.onAsk();
        }
    }

    private adjustGeminiLayout(shrink: boolean) {
        // Attempt to resize Gemini's main container to side-by-side
        // This is heuristic and might need updates as Gemini changes
        const mainContainer = document.querySelector('main');
        if (mainContainer) {
            if (shrink) {
                mainContainer.style.width = '70%';
                mainContainer.style.transition = 'width 0.3s ease';
            } else {
                mainContainer.style.width = '';
            }
        }
    }
}
