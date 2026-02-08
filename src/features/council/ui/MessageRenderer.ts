/**
 * MessageRenderer - Renders messages in Gemini's native UI style
 * Enhanced with Markdown support for Tables, Headers, Code Blocks, and Native Styling
 */

export class MessageRenderer {
    private static styleInjected = false;

    /**
     * Inject the necessary CSS styles for Council messages
     */
    public static injectStyles() {
        if (this.styleInjected) return;

        const style = document.createElement('style');
        style.id = 'council-message-styles';
        style.textContent = `
            /* Council Message Container */
            .council-conversation-container {
                display: flex;
                flex-direction: column;
                width: 100%;
                height: auto;
                min-height: min-content; 
                flex: 0 0 auto;
                position: relative;
                z-index: 1;
                margin-bottom: 24px;
                padding-bottom: 24px;
                box-sizing: border-box;
                grid-column: 1 / -1;
            }

            /* User Query Bubble Wrapper */
            .council-user-query {
                display: flex;
                justify-content: flex-end;
                padding: 0 24px 16px 24px;
                width: 100%;
                box-sizing: border-box;
                flex: 0 0 auto;
            }

            .council-user-bubble {
                max-width: 80%;
                padding: 12px 16px;
                background: var(--gem-sys-color--surface-container-highest, #3c4043);
                border-radius: 20px;
                color: var(--gem-sys-color--on-surface, #e3e3e3);
                font-family: 'Google Sans', Roboto, sans-serif;
                font-size: 16px;
                line-height: 1.5;
                word-wrap: break-word;
                box-shadow: 0 1px 2px rgba(0,0,0,0.1);
            }

            /* Model Response Container */
            .council-model-response {
                display: flex;
                flex-direction: row;
                gap: 16px;
                padding: 0 24px 16px 24px;
                align-items: flex-start;
                justify-content: flex-start;
                width: 100%;
                box-sizing: border-box;
                text-align: left;
                flex: 0 0 auto;
            }

            .council-avatar {
                flex-shrink: 0;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                margin-top: 2px;
            }

            .council-avatar.claude { background: linear-gradient(135deg, #d4a373 0%, #bc6c25 100%); }
            .council-avatar.openai { background: linear-gradient(135deg, #10a37f 0%, #1a7f64 100%); }
            .council-avatar.deepseek { background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%); }

            .council-response-content {
                flex: 1;
                min-width: 0;
                padding-top: 6px;
                display: flex;
                flex-direction: column;
                align-items: flex-start;
            }

            .council-response-header {
                display: flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 8px;
                height: 20px;
                width: 100%;
            }

            .council-model-name {
                font-family: 'Google Sans', 'Helvetica Neue', sans-serif;
                font-size: 14px;
                font-weight: 500;
                color: var(--gem-sys-color--on-surface, #e3e3e3);
                letter-spacing: 0.1px;
            }

            /* Markdown Content Styles */
            .council-markdown {
                font-family: 'Google Sans', 'Helvetica Neue', sans-serif;
                font-size: 16px;
                line-height: 1.6;
                color: var(--gem-sys-color--on-surface, #e3e3e3);
                letter-spacing: 0.1px;
                min-height: 24px;
                width: 100%;
            }

            .council-markdown p { margin: 0 0 16px 0; }
            .council-markdown p:last-child { margin-bottom: 0; }

            /* Lists */
            .council-markdown ul, .council-markdown ol {
                margin: 8px 0 16px 0;
                padding-left: 24px;
            }
            .council-markdown li { margin-bottom: 4px; }
            .council-markdown li::marker { color: var(--gem-sys-color--on-surface-variant, #9aa0a6); }

            /* Code Blocks */
            .council-markdown pre {
                background: var(--gem-sys-color--surface-container, #1e1e1e);
                padding: 16px;
                border-radius: 12px;
                overflow-x: auto;
                margin: 16px 0;
                border: 1px solid var(--gem-sys-color--outline-variant, rgba(255,255,255,0.1));
            }
            .council-markdown code {
                font-family: 'Roboto Mono', monospace;
                font-size: 13px;
            }
            .council-markdown :not(pre) > code {
                background: var(--gem-sys-color--surface-container-high, rgba(138, 180, 248, 0.1));
                color: var(--gem-sys-color--on-surface, #e3e3e3);
                padding: 2px 6px;
                border-radius: 4px;
            }

            /* Headers */
            .council-markdown h1, .council-markdown h2, .council-markdown h3 {
                color: var(--gem-sys-color--on-surface, #e8eaed);
                margin: 24px 0 12px 0;
                font-weight: 500;
                line-height: 1.3;
            }
            .council-markdown h1:first-child, 
            .council-markdown h2:first-child, 
            .council-markdown h3:first-child { margin-top: 0; }
            .council-markdown h1 { font-size: 22px; }
            .council-markdown h2 { font-size: 18px; }
            .council-markdown h3 { font-size: 16px; font-weight: 600; }

            /* Horizontal Rule */
            .council-hr {
                border: none;
                border-top: 1px solid var(--gem-sys-color--outline-variant, rgba(255,255,255,0.2));
                margin: 24px 0;
            }

            /* Tables - Mimic Gemini Native */
            .council-table-wrapper {
                width: 100%;
                overflow-x: auto;
                margin: 16px 0;
                border: 1px solid var(--gem-sys-color--outline-variant, rgba(255,255,255,0.2));
                border-radius: 12px;
            }
            .council-table {
                width: 100%;
                border-collapse: collapse;
                font-size: 14px;
                color: var(--gem-sys-color--on-surface, #e3e3e3);
            }
            .council-table th, .council-table td {
                padding: 12px 16px;
                text-align: left;
                border-bottom: 1px solid var(--gem-sys-color--outline-variant, rgba(255,255,255,0.1));
            }
            .council-table th {
                background: var(--gem-sys-color--surface-container-high, rgba(255,255,255,0.05));
                font-weight: 500;
                color: var(--gem-sys-color--on-surface-variant, #c4c7c5);
            }
            .council-table tr:last-child td { border-bottom: none; }

            /* Loading & Error */
            .council-loading {
                display: flex;
                align-items: center;
                gap: 8px;
                color: var(--gem-sys-color--on-surface-variant, #9aa0a6);
            }
            .council-loading-dots { display: flex; gap: 4px; }
            .council-loading-dot {
                width: 6px;
                height: 6px;
                background: var(--gem-sys-color--primary, #8ab4f8);
                border-radius: 50%;
                animation: council-bounce 1.4s infinite ease-in-out both;
            }
            .council-loading-dot:nth-child(1) { animation-delay: -0.32s; }
            .council-loading-dot:nth-child(2) { animation-delay: -0.16s; }
            .council-loading-dot:nth-child(3) { animation-delay: 0s; }
            @keyframes council-bounce {
                0%, 80%, 100% { transform: scale(0); }
                40% { transform: scale(1); }
            }

            .council-error {
                padding: 12px 16px;
                background: rgba(244, 67, 54, 0.1);
                border: 1px solid rgba(244, 67, 54, 0.3);
                border-radius: 12px;
                color: #f44336;
                font-size: 14px;
            }

            /* Action Buttons */
            .council-actions {
                display: flex;
                gap: 8px;
                margin-top: 8px;
                opacity: 0;
                transition: opacity 0.2s;
            }
            .council-model-response:hover .council-actions { opacity: 1; }
            .council-action-btn {
                padding: 4px 8px;
                background: transparent;
                border: none;
                border-radius: 4px;
                color: var(--gem-sys-color--on-surface-variant, #9aa0a6);
                cursor: pointer;
                transition: background-color 0.2s;
                font-size: 12px;
                display: flex;
                align-items: center;
                gap: 4px;
            }
            .council-action-btn:hover {
                background: rgba(255, 255, 255, 0.08);
                color: var(--gem-sys-color--on-surface, #e3e3e3);
            }
        `;
        document.head.appendChild(style);
        this.styleInjected = true;
    }

    public static findChatContainer(): HTMLElement | null {
        const conversationContainer = document.querySelector('.conversation-container');
        if (conversationContainer?.parentElement) {
            return conversationContainer.parentElement as HTMLElement;
        }
        const chatHistory = document.querySelector('[role="main"] .chat-history');
        if (chatHistory) return chatHistory as HTMLElement;
        const main = document.querySelector('main');
        if (main) return main as HTMLElement;
        return null;
    }

    private static getAvatarClass(modelId: string): string {
        if (modelId.includes('claude') || modelId.includes('anthropic')) return 'claude';
        if (modelId.includes('openai') || modelId.includes('gpt')) return 'openai';
        if (modelId.includes('deepseek')) return 'deepseek';
        return '';
    }

    private static getAvatarEmoji(modelId: string): string {
        if (modelId.includes('claude') || modelId.includes('anthropic')) return '🎭';
        if (modelId.includes('openai') || modelId.includes('gpt')) return '🤖';
        if (modelId.includes('deepseek')) return '🔮';
        return '✨';
    }

    public static createUserMessage(text: string): HTMLElement {
        this.injectStyles();
        const container = document.createElement('div');
        container.className = 'council-conversation-container';
        container.id = `council-msg-${Date.now()}`;

        const userQuery = document.createElement('div');
        userQuery.className = 'council-user-query';

        const bubble = document.createElement('div');
        bubble.className = 'council-user-bubble';
        bubble.textContent = text;

        userQuery.appendChild(bubble);
        container.appendChild(userQuery);
        return container;
    }

    public static createLoadingResponse(modelId: string, modelName: string): HTMLElement {
        this.injectStyles();
        const response = document.createElement('div');
        response.className = 'council-model-response';
        response.id = `council-loading-${Date.now()}`;
        response.innerHTML = `
            <div class="council-avatar ${this.getAvatarClass(modelId)}">${this.getAvatarEmoji(modelId)}</div>
            <div class="council-response-content">
                <div class="council-response-header">
                    <span class="council-model-name">${modelName}</span>
                    <span class="council-model-badge">via OpenRouter</span>
                </div>
                <div class="council-loading">
                    <div class="council-loading-dots">
                        <div class="council-loading-dot"></div>
                        <div class="council-loading-dot"></div>
                        <div class="council-loading-dot"></div>
                    </div>
                    <span>Thinking...</span>
                </div>
            </div>`;
        return response;
    }

    public static createModelResponse(modelId: string, modelName: string, content: string): HTMLElement {
        this.injectStyles();
        const response = document.createElement('div');
        response.className = 'council-model-response';
        response.id = `council-response-${Date.now()}`;

        const formattedContent = this.formatMarkdown(content);

        response.innerHTML = `
            <div class="council-avatar ${this.getAvatarClass(modelId)}">${this.getAvatarEmoji(modelId)}</div>
            <div class="council-response-content">
                <div class="council-response-header">
                    <span class="council-model-name">${modelName}</span>
                    <span class="council-model-badge">via OpenRouter</span>
                </div>
                <div class="council-markdown" data-raw-content="${this.escapeHtml(content)}">${formattedContent}</div>
                <div class="council-actions">
                    <button class="council-action-btn copy-btn" title="Copy">
                        📋 Copy
                    </button>
                </div>
            </div>`;

        // Attach event listeners
        const copyBtn = response.querySelector('.copy-btn');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                const rawContent = response.querySelector('.council-markdown')?.getAttribute('data-raw-content') || "";
                // Decode HTML entities in raw content if needed, or just use the raw 'content' passed to function
                // Actually, accessing 'content' directly here via closure is easiest if we don't rely on DOM attribute
                navigator.clipboard.writeText(content).then(() => {
                    const originalText = copyBtn.textContent;
                    copyBtn.textContent = "✅ Copied";
                    setTimeout(() => {
                        if (copyBtn) copyBtn.textContent = originalText;
                    }, 2000);
                }).catch(err => {
                    console.error('Failed to copy text: ', err);
                });
            });
        }
        return response;
    }

    public static createErrorResponse(modelId: string, modelName: string, error: string): HTMLElement {
        this.injectStyles();
        const response = document.createElement('div');
        response.className = 'council-model-response';
        response.id = `council-error-${Date.now()}`;

        let errorMessage = this.escapeHtml(error);
        if (error.includes("Receiving end does not exist") || error.includes("Could not establish connection")) {
            errorMessage += "<br/><strong>Try reloading the page. The extension context may have been invalidated.</strong>";
        }

        response.innerHTML = `
            <div class="council-avatar ${this.getAvatarClass(modelId)}">${this.getAvatarEmoji(modelId)}</div>
            <div class="council-response-content">
                <div class="council-response-header">
                    <span class="council-model-name">${modelName}</span>
                    <span class="council-model-badge">Error</span>
                </div>
                <div class="council-error">${errorMessage}</div>
            </div>`;
        return response;
    }

    /**
     * Enhanced Markdown Formatter with Table Support
     */
    private static formatMarkdown(text: string): string {
        const tokens: string[] = [];
        const protect = (content: string) => {
            tokens.push(content);
            return `__TOKEN_${tokens.length - 1}__`;
        };

        let processed = text;

        // 1. Extract Code Blocks
        processed = processed.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
            return protect(`<pre><code class="language-${lang}">${this.escapeHtml(code)}</code></pre>`);
        });

        // 2. Extract Tables
        // Regex for simple Markdown tables
        const tableRegex = /(\|.*\|\n\|[-:| ]+\|\n(?:\|.*\|\n?)*)/g;
        processed = processed.replace(tableRegex, (match) => {
            const rows = match.trim().split('\n');
            if (rows.length < 2) return match;

            let html = '<div class="council-table-wrapper"><table class="council-table"><thead><tr>';
            const headers = rows[0].split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1);
            headers.forEach(h => { html += `<th>${this.escapeHtml(h.trim())}</th>`; });
            html += '</tr></thead><tbody>';

            for (let i = 2; i < rows.length; i++) {
                const cells = rows[i].split('|').filter((_, i, arr) => i > 0 && i < arr.length - 1);
                html += '<tr>';
                cells.forEach(c => {
                    // Simple inline format for cells
                    let content = this.escapeHtml(c.trim());
                    content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
                    content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
                    html += `<td>${content}</td>`;
                });
                html += '</tr>';
            }
            html += '</tbody></table></div>';
            return protect(html);
        });

        // 3. Escape remaining text
        processed = this.escapeHtml(processed);

        // 4. Apply Formatting

        // Horizontal Rule
        processed = processed.replace(/^---$/gm, '<hr class="council-hr">');

        // Headers
        processed = processed.replace(/^### (.+)$/gm, '<h3>$1</h3>');
        processed = processed.replace(/^## (.+)$/gm, '<h2>$1</h2>');
        processed = processed.replace(/^# (.+)$/gm, '<h1>$1</h1>');

        // Bold & Italic
        processed = processed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        processed = processed.replace(/__([^_]+)__/g, '<strong>$1</strong>');
        processed = processed.replace(/\*([^*]+)\*/g, '<em>$1</em>');
        processed = processed.replace(/_([^_]+)_/g, '<em>$1</em>');

        // Inline Code
        processed = processed.replace(/`([^`]+)`/g, '<code>$1</code>');

        // Lists
        processed = processed.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
        processed = processed.replace(/^- (.+)$/gm, '<li>$1</li>');

        // Wrap lists (Naive but works for simple blocks)
        // Note: This logic for lists is tricky with regex only, but sufficient for simple responses
        processed = processed.replace(/(<li>.*<\/li>(\n|$))+/g, '<ul>$&</ul>');

        // Fix ordered lists wrapping (change ul to ol if it started with a number? hard with simple regex)
        // Ignoring complicated nested lists for now.

        // Paragraphs
        processed = processed.replace(/\n\n/g, '</p><p>');
        processed = `<p>${processed}</p>`;

        // Cleanup
        processed = processed.replace(/<p><\/p>/g, '');
        processed = processed.replace(/<p>(<h[1-3]>.*?<\/h[1-3]>)<\/p>/g, '$1');
        processed = processed.replace(/<p>(<hr.*?>)<\/p>/g, '$1');
        processed = processed.replace(/<p>(<ul>.*?<\/ul>)<\/p>/g, '$1');

        // Restore Tokens
        // Need to be careful because escapeHtml escaped our tokens!
        // The tokens look like __TOKEN_0__ but processed became __TOKEN_0__ (safe)
        // Wait, escapeHtml converts & to &amp;. So __TOKEN_0__ remains __TOKEN_0__.
        processed = processed.replace(/__TOKEN_(\d+)__/g, (match, id) => tokens[parseInt(id)]);

        // Convert single newlines to <br> inside paragraphs?
        // processed = processed.replace(/([^>])\n([^<])/g, '$1<br>$2');

        return processed;
    }

    private static escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    public static replaceLoading(loadingElement: HTMLElement, responseElement: HTMLElement) {
        loadingElement.replaceWith(responseElement);
        responseElement.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }

    public static removeElement(id: string) {
        document.getElementById(id)?.remove();
    }
}
