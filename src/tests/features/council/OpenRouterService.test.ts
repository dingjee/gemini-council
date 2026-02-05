import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openRouterService } from '@/core/services/OpenRouterService';

describe('OpenRouterService', () => {
    beforeEach(() => {
        global.fetch = vi.fn();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should call OpenRouter API with correct headers and body', async () => {
        const mockResponse = {
            id: 'test-id',
            choices: [{ message: { role: 'assistant', content: 'Test response' } }]
        };

        (global.fetch as any).mockResolvedValue({
            ok: true,
            json: async () => mockResponse
        });

        const apiKey = 'test-key';
        const modelId = 'test-model';
        const messages = [{ role: 'user', content: 'Hello' } as any];

        await openRouterService.chatCompletion(apiKey, modelId, messages);

        expect(global.fetch).toHaveBeenCalledWith(
            'https://openrouter.ai/api/v1/chat/completions',
            expect.objectContaining({
                method: 'POST',
                headers: expect.objectContaining({
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': expect.any(String),
                    'X-Title': expect.any(String)
                }),
                body: JSON.stringify({
                    model: modelId,
                    messages: messages
                })
            })
        );
    });

    it('should handle API errors', async () => {
        (global.fetch as any).mockResolvedValue({
            ok: false,
            status: 401,
            statusText: 'Unauthorized'
        });

        const result = await openRouterService.chatCompletion('bad-key', 'model', []);

        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
    });
});
