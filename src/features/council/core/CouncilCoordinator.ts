import { marked } from 'marked';
import { DOMContentExtractor } from '@/features/export/services/DOMContentExtractor';
import { SidecarUI } from '@/features/council/ui/Sidecar';
import { HistoryFormatter } from './HistoryFormatter';
import { COUNCIL_MESSAGE_TYPES, CouncilRequestPayload, CouncilResponsePayload } from './types';
import { domService } from '@/core/services/DOMService';

export class CouncilCoordinator {
    private sidecar: SidecarUI;

    constructor() {
        this.sidecar = new SidecarUI();
        this.sidecar.onAsk = () => this.handleAsk();
    }

    private async handleAsk() {
        const settings = this.sidecar.getSettings();
        if (!settings.apiKey) {
            this.sidecar.updateOutput('<div style="color:#ff6b6b">Please enter your OpenRouter API Key in the settings above.</div>');
            return;
        }

        this.sidecar.setLoading(true);

        try {
            // 1. Capture Context
            // functionality to capture chat history using DOMContentExtractor
            // We look for the main chat container. 
            // DOMContentExtractor doesn't have a "get all turns" method easily exposed? 
            // Let's look at ConversationExportService to see how it extracts turns.
            // It iterates over `user-query` and `model-response`.

            const turns = await this.extractChatHistory();

            // 2. Format for API
            // Add a system prompt to the formatter
            const SYSTEM_PROMPT = `You are the "Council of Models", an objective critic and supplementary intelligence observing a conversation between a User and Google Gemini. 
Your goal is to:
1. Validate Gemini's claims.
2. Offer alternative perspectives or better solutions if Gemini's answer is suboptimal.
3. Catch hallucinations or errors.
4. Be concise and high-impact. Do not be conversational. Go straight to the critique or addition.`;

            const messages = HistoryFormatter.format(turns, SYSTEM_PROMPT);

            // 3. Send to Background
            const payload: CouncilRequestPayload = {
                prompt: messages[messages.length - 1]?.content || '', // Redundant but useful for logging
                history: messages, // HistoryFormatter already converts it. Wait, the Payload expects Voyager ChatTurns or OpenAIMessages?
                // My types.ts defined 'history: unknown'. Ideally it should be OpenAIMessages if formatting is done here.
                // Let's re-verify types.ts. I put 'unknown' but comment said "Voyager's ChatTurn[]".
                // Actually, better to send the formatted messages to save work in background. 
                // I will cast it here for now, or update the background handler to expect OpenAIMessages.
                // Let's send OpenAIMessages.
                modelId: settings.modelId,
                apiKey: settings.apiKey,
                includeFullHistory: true,
            };

            const response = await chrome.runtime.sendMessage({
                type: COUNCIL_MESSAGE_TYPES.SUBMIT_QUERY,
                payload
            });

            // 4. Render Response
            if (response && response.success && response.data) {
                const markdown = response.data.content;
                const html = await marked.parse(markdown);
                this.sidecar.updateOutput(html);
            } else {
                throw new Error(response?.error || 'Unknown error from Council');
            }

        } catch (error) {
            this.sidecar.updateOutput(`<div style="color:#ff6b6b">Error: ${error instanceof Error ? error.message : String(error)}</div>`);
        } finally {
            // this.sidecar.setLoading(false); // updateOutput overwrites it
        }
    }

    private async extractChatHistory() {
        // Simplified extraction logic mirroring ConversationExportService
        const turnElements = document.querySelectorAll('user-query, model-response');
        const turns: any[] = [];

        // Naive pairing: assume User then Model. 
        // Gemini DOM is a flat list of user-query and model-response elements (usually wrapped in chunks).
        // Actually, looking at DOMContentExtractor, it processes elements passed to it.
        // Let's just grab all `user-query` and `model-response` in order.

        let currentUser = '';

        for (const el of Array.from(turnElements)) {
            if (el.tagName.toLowerCase() === 'user-query') {
                const extracted = DOMContentExtractor.extractUserContent(el as HTMLElement);
                currentUser = extracted.text;
            } else if (el.tagName.toLowerCase() === 'model-response') {
                const extracted = DOMContentExtractor.extractAssistantContent(el as HTMLElement);
                if (currentUser) {
                    turns.push({ user: currentUser, assistant: extracted.text, starred: false });
                    currentUser = '';
                }
            }
        }

        // Handle last user query if no response yet (unlikely in this flow as we are supplementing, but possible)
        if (currentUser) {
            turns.push({ user: currentUser, assistant: '', starred: false });
        }

        return turns;
    }
}

export function startCouncil() {
    const coordinator = new CouncilCoordinator();
}
