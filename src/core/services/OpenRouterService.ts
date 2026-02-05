import type { Result } from '@/core/types/common';
import { z } from 'zod';
import { OpenAIMessage, OpenRouterResponseSchema } from '../../features/council/core/types';

/**
 * Service for interacting with OpenRouter API
 * Located in core/services as it handles external network communication
 */
export class OpenRouterService {
    private static readonly BASE_URL = 'https://openrouter.ai/api/v1';

    /**
     * Send a chat completion request to OpenRouter
     */
    async chatCompletion(
        apiKey: string,
        modelId: string,
        messages: OpenAIMessage[]
    ): Promise<Result<{ content: string; usage?: any }>> {
        try {
            const response = await fetch(`${OpenRouterService.BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                    'HTTP-Referer': 'https://github.com/Nagi-ovo/gemini-voyager-council',
                    'X-Title': 'Gemini Council'
                },
                body: JSON.stringify({
                    model: modelId,
                    messages: messages
                })
            });

            if (!response.ok) {
                return {
                    success: false,
                    error: new Error(`OpenRouter API error: ${response.status} ${response.statusText}`)
                };
            }

            const data = await response.json();

            // Basic validation (or use zod parse if strictly enforcing)
            const parsed = OpenRouterResponseSchema.safeParse(data);

            if (!parsed.success) {
                return { success: false, error: new Error('Invalid response format from OpenRouter') };
            }

            const choice = parsed.data.choices[0];
            if (!choice || !choice.message) {
                return { success: false, error: new Error('No completion choices returned') };
            }

            return {
                success: true,
                data: {
                    content: choice.message.content,
                    usage: parsed.data.usage
                }
            };

        } catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error : new Error(String(error))
            };
        }
    }

    /**
     * Validate API Key by making a lightweight model list call
     */
    async validateKey(apiKey: string): Promise<boolean> {
        try {
            const response = await fetch(`${OpenRouterService.BASE_URL}/auth/key`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            return response.ok;
        } catch {
            return false;
        }
    }
}

export const openRouterService = new OpenRouterService();
