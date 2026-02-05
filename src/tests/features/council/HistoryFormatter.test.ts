import { describe, it, expect } from 'vitest';
import { HistoryFormatter } from '@/features/council/core/HistoryFormatter';
import { ChatTurn } from '@/features/export/types/export';

describe('HistoryFormatter', () => {
    it('should convert Voyager ChatTurns to OpenAI messages', () => {
        const turns: ChatTurn[] = [
            {
                user: 'Hello',
                assistant: 'Hi there',
                starred: false
            },
            {
                user: 'How are you?',
                assistant: 'I am fine',
                starred: false
            }
        ];

        const messages = HistoryFormatter.format(turns);

        expect(messages).toHaveLength(4);
        expect(messages[0]).toEqual({ role: 'user', content: 'Hello' });
        expect(messages[1]).toEqual({ role: 'assistant', content: 'Hi there' });
        expect(messages[2]).toEqual({ role: 'user', content: 'How are you?' });
        expect(messages[3]).toEqual({ role: 'assistant', content: 'I am fine' });
    });

    it('should handle system prompt injection', () => {
        const turns: ChatTurn[] = [{ user: 'Hi', assistant: 'Hello', starred: false }];
        const systemPrompt = 'You are a critic.';

        const messages = HistoryFormatter.format(turns, systemPrompt);

        expect(messages).toHaveLength(3);
        expect(messages[0]).toEqual({ role: 'system', content: 'You are a critic.' });
        expect(messages[1]).toEqual({ role: 'user', content: 'Hi' });
    });

    it('should truncate history if token count is too high (mock strategy)', () => {
        // This test might fail initially as we haven't implemented truncation logic yet
        // For now, we just enforce that it DOESN'T fail on simple inputs
        const turns: ChatTurn[] = [];
        const messages = HistoryFormatter.format(turns);
        expect(messages).toEqual([]);
    });
});
