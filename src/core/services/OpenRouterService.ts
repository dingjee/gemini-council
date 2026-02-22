
import * as z from "zod";

export const OpenRouterResponseSchema = z.object({
    choices: z.array(
        z.object({
            message: z.object({
                content: z.string(),
            }),
        })
    ),
});

export type OpenRouterResponse = z.infer<typeof OpenRouterResponseSchema>;

export class OpenRouterService {
    private apiKey: string;
    private baseUrl = "https://openrouter.ai/api/v1/chat/completions";

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async generateDelay(model: string, prompt: string): Promise<string> {
        // Mocking network delay/prep if needed, but fetch is async anyway
        return this.generate(model, prompt);
    }

    async generate(model: string, prompt: string): Promise<string> {
        const response = await fetch(this.baseUrl, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${this.apiKey}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://gemini-council.local",
                "X-Title": "Gemini Council",
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: "user", content: prompt }],
            }),
        });

        if (!response.ok) {
            let errorDetail = response.statusText;
            try {
                const errorData = await response.json();
                if (errorData?.error?.message) {
                    errorDetail = errorData.error.message;
                } else if (typeof errorData?.error === "string") {
                    errorDetail = errorData.error;
                } else if (errorData?.message) {
                    errorDetail = errorData.message;
                }
            } catch {
                // Ignore JSON parse errors, use statusText
            }
            throw new Error(`OpenRouter API Error: ${errorDetail}`);
        }

        const data = await response.json();
        const parsed = OpenRouterResponseSchema.safeParse(data);

        if (!parsed.success) {
            console.error("OpenRouter Parse Error:", parsed.error);
            throw new Error("Invalid response from OpenRouter");
        }

        return parsed.data.choices[0]?.message.content || "";
    }
}
