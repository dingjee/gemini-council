import { ChatTurn } from '@/features/export/types/export';
import { OpenAIMessage } from './types';

export class HistoryFormatter {
    /**
     * meaningful conversion from Voyager's ChatTurn[] to OpenAI's messages format
     */
    static format(turns: ChatTurn[], systemPrompt?: string): OpenAIMessage[] {
        const messages: OpenAIMessage[] = [];

        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }

        for (const turn of turns) {
            if (turn.user) {
                messages.push({ role: 'user', content: turn.user });
            }
            if (turn.assistant) {
                messages.push({ role: 'assistant', content: turn.assistant });
            }
        }

        return messages;
    }
}
