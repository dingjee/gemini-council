import { OpenRouterService } from "./core/services/OpenRouterService";

console.log("Gemini Council: Background script initializing...");

// Get API Key from environment or storage (fallback)
// Note: process.env is replaced at build time
const envApiKey = process.env.OPENROUTER_API_KEY || "";

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("Gemini Council (BG): Received message", message.type);

    if (message.type === "COUNCIL_QUERY") {
        handleCouncilQuery(message.payload, sendResponse);
        return true; // Indicates async response will be sent
    }
});

async function handleCouncilQuery(payload: { model: string; prompt: string }, sendResponse: (response: any) => void) {
    try {
        console.log("Gemini Council (BG): Processing query for model", payload.model);

        // Try getting API key from storage if env var is missing
        let apiKey = envApiKey;
        if (!apiKey) {
            const storage = await chrome.storage.local.get("council_apikey");
            apiKey = (storage.council_apikey as string) || "";
        }

        if (!apiKey) {
            console.error("Gemini Council (BG): No API Key found");
            sendResponse({ error: "OpenRouter API Key not configured. Please set it in options or .env" });
            return;
        }

        const openRouter = new OpenRouterService(apiKey);

        console.log("Gemini Council (BG): Sending request to OpenRouter...");
        const result = await openRouter.generate(payload.model, payload.prompt);
        console.log("Gemini Council (BG): Request successful");

        sendResponse({ success: true, data: { choices: [{ message: { content: result } }] } });
    } catch (error: any) {
        console.error("Gemini Council (BG): Network Error:", error);
        sendResponse({ error: error.message || "Unknown network error" });
    }
}

