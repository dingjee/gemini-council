
export class ModelSelector {
    private container: HTMLElement;
    private select: HTMLSelectElement;
    private activeModel: string = "gemini"; // Default
    private onModelChange: (model: string) => void;

    constructor(onModelChange: (model: string) => void) {
        this.onModelChange = onModelChange;
        this.container = document.createElement("div");
        this.select = document.createElement("select");
        this.initUI();
    }

    private initUI() {
        this.container.style.position = "fixed";
        this.container.style.bottom = "80px"; // Adjust based on Gemini UI
        this.container.style.right = "20px";
        this.container.style.zIndex = "999";
        this.container.style.backgroundColor = "#1e1e1e"; // Dark mode assumption
        this.container.style.padding = "8px";
        this.container.style.borderRadius = "8px";
        this.container.style.boxShadow = "0 4px 6px rgba(0,0,0,0.1)";
        this.container.style.display = "flex";
        this.container.style.alignItems = "center";
        this.container.style.gap = "8px";

        const label = document.createElement("span");
        label.innerText = "Council:";
        label.style.color = "#fff";
        label.style.fontSize = "12px";
        label.style.fontFamily = "Google Sans, sans-serif";

        const options = [
            { value: "gemini", label: "Gemini (Native)" },
            { value: "anthropic/claude-3-opus", label: "Claude Opus 4.6" },
            { value: "openai/gpt-4-turbo", label: "ChatGPT 5.2" }
        ];

        options.forEach(opt => {
            const option = document.createElement("option");
            option.value = opt.value;
            option.innerText = opt.label;
            this.select.appendChild(option);
        });

        this.select.style.backgroundColor = "#333";
        this.select.style.color = "#fff";
        this.select.style.border = "none";
        this.select.style.padding = "4px 8px";
        this.select.style.borderRadius = "4px";
        this.select.style.cursor = "pointer";

        this.select.onchange = () => {
            this.activeModel = this.select.value;
            this.onModelChange(this.activeModel);
            this.updateIndicator();
        };

        this.container.appendChild(label);
        this.container.appendChild(this.select);
        document.body.appendChild(this.container);
    }

    private updateIndicator() {
        if (this.activeModel !== "gemini") {
            this.container.style.border = "1px solid #4CAF50";
        } else {
            this.container.style.border = "none";
        }
    }

    public getActiveModel(): string {
        return this.activeModel;
    }
}
