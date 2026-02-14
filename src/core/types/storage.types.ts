/**
 * Storage Types for Local-First + GitHub Gist Sync Architecture
 * 
 * These types define the schema for IndexedDB and cloud sync operations.
 */

import * as z from "zod";

// ============================================================================
// Core Message Types
// ============================================================================

/**
 * Schema for external model messages injected into Gemini conversations
 */
export const ExternalMessageSchema = z.object({
    /** Unique message identifier */
    id: z.string().uuid(),
    /** Model identifier (e.g., "anthropic/claude-3-opus") */
    modelId: z.string(),
    /** Human-readable model name */
    modelName: z.string(),
    /** The user prompt that triggered this response */
    userPrompt: z.string(),
    /** The model's response content */
    content: z.string(),
    /** Timestamp of creation */
    createdAt: z.number(),
    /** Optional: whether context was attached */
    contextAttached: z.boolean().optional(),
});

export type ExternalMessage = z.infer<typeof ExternalMessageSchema>;

// ============================================================================
// Anchor Types (for DOM re-injection)
// ============================================================================

/**
 * Represents the anchor point for re-injecting messages after page refresh.
 * Uses content hashing to locate the correct position in the DOM.
 */
export const MessageAnchorSchema = z.object({
    /** Hash of the preceding Gemini message content (for positioning) */
    precedingMessageHash: z.string(),
    /** Index position within the conversation (fallback) */
    positionIndex: z.number(),
    /** A snippet of the preceding message for verification */
    precedingMessageSnippet: z.string().max(200),
});

export type MessageAnchor = z.infer<typeof MessageAnchorSchema>;

// ============================================================================
// Stored Conversation
// ============================================================================

/**
 * Schema for a stored conversation with external model messages
 */
export const StoredConversationSchema = z.object({
    /** Primary Key: Gemini conversation ID from URL */
    id: z.string(),
    /** Array of injected external messages */
    messages: z.array(ExternalMessageSchema),
    /** Map of message ID to anchor for DOM positioning */
    anchors: z.record(z.string(), MessageAnchorSchema),
    /** Last modification timestamp (used for sync conflict resolution) */
    lastUpdated: z.number(),
    /** Whether this record has been synced to cloud */
    synced: z.boolean(),
    /** Optional: Gemini conversation title for display */
    title: z.string().optional(),
});

export type StoredConversation = z.infer<typeof StoredConversationSchema>;

// ============================================================================
// Cloud Backup Format
// ============================================================================

/**
 * Schema for the cloud backup file structure
 */
export const CloudBackupSchema = z.object({
    /** Backup format version for future migrations */
    version: z.literal(1),
    /** Extension identifier */
    extensionId: z.literal("gemini-council"),
    /** Timestamp of last backup */
    lastBackupAt: z.number(),
    /** All stored conversations */
    conversations: z.array(StoredConversationSchema),
    /** Metadata for sync optimization */
    metadata: z.object({
        totalMessages: z.number(),
        deviceId: z.string().optional(),
    }),
});

export type CloudBackup = z.infer<typeof CloudBackupSchema>;

// ============================================================================
// Sync State Types
// ============================================================================

export type SyncStatus = "idle" | "syncing" | "error" | "offline";

export interface SyncState {
    status: SyncStatus;
    lastSyncAt: number | null;
    pendingChanges: number;
    error: string | null;
}

// ============================================================================
// Event Types for EventBus
// ============================================================================

export interface StorageEvents {
    "message:saved": { conversationId: string; message: ExternalMessage };
    "conversation:updated": { conversationId: string };
    "sync:started": void;
    "sync:completed": { success: boolean; error?: string };
    "sync:progress": { current: number; total: number };
}

// ============================================================================
// Helper Factory Functions
// ============================================================================

/**
 * Creates a new ExternalMessage with default values
 */
export function createExternalMessage(
    params: Pick<ExternalMessage, "modelId" | "modelName" | "userPrompt" | "content"> &
        Partial<Pick<ExternalMessage, "contextAttached">>
): ExternalMessage {
    return {
        id: crypto.randomUUID(),
        modelId: params.modelId,
        modelName: params.modelName,
        userPrompt: params.userPrompt,
        content: params.content,
        createdAt: Date.now(),
        contextAttached: params.contextAttached ?? false,
    };
}

/**
 * Creates a new StoredConversation with default values
 */
export function createStoredConversation(id: string, title?: string): StoredConversation {
    return {
        id,
        messages: [],
        anchors: {},
        lastUpdated: Date.now(),
        synced: false,
        title,
    };
}

/**
 * Creates an empty CloudBackup structure
 */
export function createEmptyBackup(): CloudBackup {
    return {
        version: 1,
        extensionId: "gemini-council",
        lastBackupAt: Date.now(),
        conversations: [],
        metadata: {
            totalMessages: 0,
        },
    };
}

/**
 * Generates a simple hash for message content (for anchoring)
 */
export function hashMessageContent(content: string): string {
    // Simple DJB2 hash - not cryptographic, just for comparison
    let hash = 5381;
    for (let i = 0; i < content.length; i++) {
        hash = ((hash << 5) + hash) + content.charCodeAt(i);
        hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
}
