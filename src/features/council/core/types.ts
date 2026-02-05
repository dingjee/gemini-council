import { z } from 'zod';

// --- OpenRouter / OpenAI Types ---

export const OpenAIMessageSchema = z.object({
    role: z.enum(['system', 'user', 'assistant']),
    content: z.string(),
});

export type OpenAIMessage = z.infer<typeof OpenAIMessageSchema>;

export const OpenRouterResponseSchema = z.object({
    id: z.string(),
    choices: z.array(
        z.object({
            message: OpenAIMessageSchema,
            finish_reason: z.string().nullable().optional(),
        })
    ),
    usage: z.object({
        prompt_tokens: z.number().optional(),
        completion_tokens: z.number().optional(),
        total_tokens: z.number().optional(),
    }).optional(),
});

export type OpenRouterResponse = z.infer<typeof OpenRouterResponseSchema>;

// --- Council Internal Types ---

export interface CouncilRequestPayload {
    prompt: string;
    history: unknown; // To be typed strictly with Voyager's ChatTurn[]
    pdfContext?: string;
    modelId: string;
    apiKey: string;
    includeFullHistory: boolean;
}

export interface CouncilResponsePayload {
    success: boolean;
    data?: {
        content: string;
        usage?: {
            promptTokens: number;
            completionTokens: number;
        };
    }; // Normalized response
    error?: string;
}

// --- Message Types for Background Communication ---

export const COUNCIL_MESSAGE_TYPES = {
    SUBMIT_QUERY: 'gv.council.submitQuery',
} as const;
