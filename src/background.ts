/**
 * Background Script - Extension Service Worker
 * 
 * Handles:
 * - OpenRouter API calls (existing)
 * - Sync management (new)
 * - Message routing between components
 */

import { OpenRouterService } from "./core/services/OpenRouterService";
import { SyncManager } from "./core/services/SyncManager";
import { StorageService } from "./core/services/StorageService";
import type { ExternalMessage, MessageAnchor } from "./core/types/storage.types";

console.log("Gemini Council: Background script initializing...");

// ============================================================================
// Initialization
// ============================================================================

// Get API Key from environment or storage (fallback)
// Note: process.env is replaced at build time
const envApiKey = process.env.OPENROUTER_API_KEY || "";

// Lazy-init sync manager
let syncManagerInitialized = false;

async function ensureSyncInitialized(): Promise<SyncManager> {
    const syncManager = SyncManager.getInstance();

    if (!syncManagerInitialized) {
        try {
            await syncManager.init();
            syncManagerInitialized = true;
            console.log("Gemini Council (BG): SyncManager initialized");
        } catch (error) {
            console.error("Gemini Council (BG): SyncManager init failed", error);
        }
    }

    return syncManager;
}

// Initialize on startup
ensureSyncInitialized();

// ============================================================================
// Message Types
// ============================================================================

interface CouncilQueryPayload {
    model: string;
    prompt: string;
}

interface SaveMessagePayload {
    conversationId: string;
    message: ExternalMessage;
    anchor: MessageAnchor;
    conversationTitle?: string;
}

interface GetMessagesPayload {
    conversationId: string;
}

type MessageType =
    | "COUNCIL_QUERY"
    | "SAVE_MESSAGE"
    | "GET_MESSAGES"
    | "GET_CONVERSATION"
    | "SYNC_NOW"
    | "SYNC_STATUS"
    | "SYNC_LOGIN"
    | "SYNC_LOGOUT";

interface Message<T = unknown> {
    type: MessageType;
    payload?: T;
}

// ============================================================================
// Message Handler
// ============================================================================

chrome.runtime.onMessage.addListener((message: Message, sender, sendResponse) => {
    console.log("Gemini Council (BG): Received message", message.type);

    switch (message.type) {
        case "COUNCIL_QUERY":
            handleCouncilQuery(
                message.payload as CouncilQueryPayload,
                sendResponse
            );
            return true; // Async response

        case "SAVE_MESSAGE":
            handleSaveMessage(
                message.payload as SaveMessagePayload,
                sendResponse
            );
            return true;

        case "GET_MESSAGES":
            handleGetMessages(
                message.payload as GetMessagesPayload,
                sendResponse
            );
            return true;

        case "GET_CONVERSATION":
            handleGetConversation(
                message.payload as GetMessagesPayload,
                sendResponse
            );
            return true;

        case "SYNC_NOW":
            handleSyncNow(sendResponse);
            return true;

        case "SYNC_STATUS":
            handleSyncStatus(sendResponse);
            return true;

        case "SYNC_LOGIN":
            handleSyncLogin(sendResponse);
            return true;

        case "SYNC_LOGOUT":
            handleSyncLogout(sendResponse);
            return true;

        default:
            console.warn("Gemini Council (BG): Unknown message type", message.type);
            return false;
    }
});

// ============================================================================
// OpenRouter Query Handler (existing functionality)
// ============================================================================

async function handleCouncilQuery(
    payload: CouncilQueryPayload,
    sendResponse: (response: unknown) => void
): Promise<void> {
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
            sendResponse({
                error: "OpenRouter API Key not configured. Please set it in options or .env"
            });
            return;
        }

        const openRouter = new OpenRouterService(apiKey);

        console.log("Gemini Council (BG): Sending request to OpenRouter...");
        const result = await openRouter.generate(payload.model, payload.prompt);
        console.log("Gemini Council (BG): Request successful");

        sendResponse({
            success: true,
            data: { choices: [{ message: { content: result } }] }
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Gemini Council (BG): Network Error:", errorMessage);
        sendResponse({ error: errorMessage });
    }
}

// ============================================================================
// Storage Handlers (new functionality)
// ============================================================================

async function handleSaveMessage(
    payload: SaveMessagePayload,
    sendResponse: (response: unknown) => void
): Promise<void> {
    try {
        const storage = StorageService.getInstance();
        await storage.init();

        await storage.saveMessage(
            payload.conversationId,
            payload.message,
            payload.anchor,
            payload.conversationTitle
        );

        // Notify sync manager of the change
        const syncManager = await ensureSyncInitialized();
        syncManager.recordChange(payload.conversationId);

        sendResponse({ success: true });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Gemini Council (BG): Save message error:", errorMessage);
        sendResponse({ success: false, error: errorMessage });
    }
}

async function handleGetMessages(
    payload: GetMessagesPayload,
    sendResponse: (response: unknown) => void
): Promise<void> {
    try {
        const storage = StorageService.getInstance();
        await storage.init();

        const messages = await storage.getMessages(payload.conversationId);

        sendResponse({ success: true, data: messages });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Gemini Council (BG): Get messages error:", errorMessage);
        sendResponse({ success: false, error: errorMessage });
    }
}

async function handleGetConversation(
    payload: GetMessagesPayload,
    sendResponse: (response: unknown) => void
): Promise<void> {
    try {
        const storage = StorageService.getInstance();
        await storage.init();

        const conversation = await storage.getConversation(payload.conversationId);

        sendResponse({ success: true, data: conversation });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Gemini Council (BG): Get conversation error:", errorMessage);
        sendResponse({ success: false, error: errorMessage });
    }
}

// ============================================================================
// Sync Handlers (new functionality)
// ============================================================================

async function handleSyncNow(
    sendResponse: (response: unknown) => void
): Promise<void> {
    try {
        const syncManager = await ensureSyncInitialized();
        const success = await syncManager.forceSync();

        sendResponse({ success, state: syncManager.getState() });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Gemini Council (BG): Sync error:", errorMessage);
        sendResponse({ success: false, error: errorMessage });
    }
}

async function handleSyncStatus(
    sendResponse: (response: unknown) => void
): Promise<void> {
    try {
        const syncManager = await ensureSyncInitialized();
        const isLoggedIn = await syncManager.isLoggedIn();

        sendResponse({
            success: true,
            state: syncManager.getState(),
            isLoggedIn,
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        sendResponse({ success: false, error: errorMessage });
    }
}

async function handleSyncLogin(
    sendResponse: (response: unknown) => void
): Promise<void> {
    try {
        const syncManager = await ensureSyncInitialized();
        const success = await syncManager.login();

        sendResponse({ success, state: syncManager.getState() });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Gemini Council (BG): Login error:", errorMessage);
        sendResponse({ success: false, error: errorMessage });
    }
}

async function handleSyncLogout(
    sendResponse: (response: unknown) => void
): Promise<void> {
    try {
        const syncManager = await ensureSyncInitialized();
        await syncManager.logout();

        sendResponse({ success: true });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error("Gemini Council (BG): Logout error:", errorMessage);
        sendResponse({ success: false, error: errorMessage });
    }
}
