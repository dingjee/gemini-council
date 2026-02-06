import { OpenRouterService } from "./core/services/OpenRouterService";

console.log("Gemini Council: Background script loaded.");

const apiKey = process.env.OPENROUTER_API_KEY || "";
const openRouter = new OpenRouterService(apiKey);

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "COUNCIL_QUERY") {
        handleCouncilQuery(message.payload, sendResponse);
        return true; // Indicates async response
    }
});

async function handleCouncilQuery(payload: { model: string; prompt: string }, sendResponse: (response: any) => void) {
    try {
        if (!apiKey) {
            sendResponse({ error: "API Key not found in environment" });
            return;
        }

        const result = await openRouter.generate(payload.model, payload.prompt);
        sendResponse({ success: true, data: { choices: [{ message: { content: result } }] } });
    } catch (error: any) {
        console.error("Network Error:", error);
        sendResponse({ error: error.message });
    }
}
