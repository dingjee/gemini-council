/**
 * StorageService - Local-First IndexedDB Operations
 * 
 * This service manages all local data persistence using Dexie.js.
 * UI always reads from this service for zero-latency access.
 */

import Dexie, { type Table } from "dexie";
import {
    type StoredConversation,
    type ExternalMessage,
    type MessageAnchor,
    StoredConversationSchema,
    createStoredConversation,
    hashMessageContent,
} from "../types/storage.types";

// ============================================================================
// Database Schema Definition
// ============================================================================

class CouncilDatabase extends Dexie {
    conversations!: Table<StoredConversation, string>;

    constructor() {
        super("GeminiCouncilDB");

        // Version 1 schema
        this.version(1).stores({
            // Primary key is 'id', index on 'synced' and 'lastUpdated' for sync queries
            conversations: "id, synced, lastUpdated",
        });
    }
}

// ============================================================================
// StorageService Class
// ============================================================================

export class StorageService {
    private db: CouncilDatabase;
    private static instance: StorageService | null = null;

    private constructor() {
        this.db = new CouncilDatabase();
    }

    /**
     * Singleton accessor - ensures single database connection
     */
    static getInstance(): StorageService {
        if (!StorageService.instance) {
            StorageService.instance = new StorageService();
        }
        return StorageService.instance;
    }

    /**
     * Initialize the database connection
     */
    async init(): Promise<void> {
        await this.db.open();
        console.log("StorageService: Database initialized");
    }

    // ========================================================================
    // Conversation Operations
    // ========================================================================

    /**
     * Get a conversation by ID, returns null if not found
     */
    async getConversation(conversationId: string): Promise<StoredConversation | null> {
        const record = await this.db.conversations.get(conversationId);
        return record ?? null;
    }

    /**
     * Get or create a conversation
     */
    async getOrCreateConversation(
        conversationId: string,
        title?: string
    ): Promise<StoredConversation> {
        let conversation = await this.getConversation(conversationId);

        if (!conversation) {
            conversation = createStoredConversation(conversationId, title);
            await this.db.conversations.add(conversation);
            console.log(`StorageService: Created new conversation ${conversationId}`);
        }

        return conversation;
    }

    /**
     * Get all conversations, optionally filtered by sync status
     */
    async getAllConversations(onlyUnsynced = false): Promise<StoredConversation[]> {
        if (onlyUnsynced) {
            return this.db.conversations.where("synced").equals(0).toArray();
        }
        return this.db.conversations.toArray();
    }

    /**
     * Get conversations updated after a certain timestamp
     */
    async getConversationsUpdatedAfter(timestamp: number): Promise<StoredConversation[]> {
        return this.db.conversations
            .where("lastUpdated")
            .above(timestamp)
            .toArray();
    }

    // ========================================================================
    // Message Operations
    // ========================================================================

    /**
     * Save a new message to a conversation
     * This is the primary write path - called immediately when user sends a query
     */
    async saveMessage(
        conversationId: string,
        message: ExternalMessage,
        anchor: MessageAnchor,
        conversationTitle?: string
    ): Promise<void> {
        await this.db.transaction("rw", this.db.conversations, async () => {
            let conversation = await this.db.conversations.get(conversationId);

            if (!conversation) {
                conversation = createStoredConversation(conversationId, conversationTitle);
            }

            // Add message
            conversation.messages.push(message);

            // Add anchor mapping
            conversation.anchors[message.id] = anchor;

            // Update metadata
            conversation.lastUpdated = Date.now();
            conversation.synced = false; // Mark as needing sync

            // Update title if provided and not set
            if (conversationTitle && !conversation.title) {
                conversation.title = conversationTitle;
            }

            await this.db.conversations.put(conversation);
        });

        console.log(`StorageService: Saved message ${message.id} to conversation ${conversationId}`);
    }

    /**
     * Get all messages for a conversation
     */
    async getMessages(conversationId: string): Promise<ExternalMessage[]> {
        const conversation = await this.getConversation(conversationId);
        return conversation?.messages ?? [];
    }

    /**
     * Get anchor for a specific message
     */
    async getMessageAnchor(
        conversationId: string,
        messageId: string
    ): Promise<MessageAnchor | null> {
        const conversation = await this.getConversation(conversationId);
        return conversation?.anchors[messageId] ?? null;
    }

    // ========================================================================
    // Sync Support Operations
    // ========================================================================

    /**
     * Mark conversations as synced
     */
    async markSynced(conversationIds: string[]): Promise<void> {
        await this.db.transaction("rw", this.db.conversations, async () => {
            for (const id of conversationIds) {
                await this.db.conversations.update(id, { synced: true });
            }
        });
        console.log(`StorageService: Marked ${conversationIds.length} conversations as synced`);
    }

    /**
     * Get count of unsynced conversations
     */
    async getUnsyncedCount(): Promise<number> {
        // Dexie stores booleans as 0/1 in indexed fields
        return this.db.conversations.where("synced").equals(0).count();
    }

    /**
     * Merge cloud data into local storage (for hydration)
     * Uses "Last Write Wins" + "Union" strategy for conflict resolution
     */
    async mergeFromCloud(cloudConversations: StoredConversation[]): Promise<{
        added: number;
        updated: number;
        unchanged: number;
    }> {
        let added = 0;
        let updated = 0;
        let unchanged = 0;

        await this.db.transaction("rw", this.db.conversations, async () => {
            for (const cloudConv of cloudConversations) {
                const localConv = await this.db.conversations.get(cloudConv.id);

                if (!localConv) {
                    // New conversation from cloud - add it
                    cloudConv.synced = true;
                    await this.db.conversations.add(cloudConv);
                    added++;
                } else if (cloudConv.lastUpdated > localConv.lastUpdated) {
                    // Cloud is newer - merge messages (union strategy)
                    const mergedMessages = this.mergeMessages(
                        localConv.messages,
                        cloudConv.messages
                    );
                    const mergedAnchors = { ...localConv.anchors, ...cloudConv.anchors };

                    await this.db.conversations.update(cloudConv.id, {
                        messages: mergedMessages,
                        anchors: mergedAnchors,
                        lastUpdated: cloudConv.lastUpdated,
                        synced: true,
                        title: cloudConv.title || localConv.title,
                    });
                    updated++;
                } else if (cloudConv.lastUpdated < localConv.lastUpdated) {
                    // Local is newer - keep local, mark for re-sync
                    // (already handled by synced=false flag)
                    unchanged++;
                } else {
                    // Same timestamp - no action needed
                    unchanged++;
                }
            }
        });

        console.log(`StorageService: Merge complete - Added: ${added}, Updated: ${updated}, Unchanged: ${unchanged}`);
        return { added, updated, unchanged };
    }

    /**
     * Merge message arrays using union strategy
     * Messages are identified by their unique ID
     */
    private mergeMessages(
        local: ExternalMessage[],
        cloud: ExternalMessage[]
    ): ExternalMessage[] {
        const messageMap = new Map<string, ExternalMessage>();

        // Add all local messages
        for (const msg of local) {
            messageMap.set(msg.id, msg);
        }

        // Add/overwrite with cloud messages
        for (const msg of cloud) {
            if (!messageMap.has(msg.id)) {
                messageMap.set(msg.id, msg);
            }
        }

        // Sort by creation time
        return Array.from(messageMap.values())
            .sort((a, b) => a.createdAt - b.createdAt);
    }

    /**
     * Bulk import conversations (for full restore)
     */
    async bulkImport(conversations: StoredConversation[]): Promise<void> {
        // Validate all conversations first
        for (const conv of conversations) {
            const result = StoredConversationSchema.safeParse(conv);
            if (!result.success) {
                throw new Error(`Invalid conversation data: ${result.error.message}`);
            }
        }

        await this.db.conversations.bulkPut(conversations);
        console.log(`StorageService: Bulk imported ${conversations.length} conversations`);
    }

    /**
     * Export all data for backup
     */
    async exportAll(): Promise<StoredConversation[]> {
        return this.db.conversations.toArray();
    }

    /**
     * Clear all data (use with caution!)
     */
    async clearAll(): Promise<void> {
        await this.db.conversations.clear();
        console.log("StorageService: All data cleared");
    }

    /**
     * Delete a specific conversation
     */
    async deleteConversation(conversationId: string): Promise<void> {
        await this.db.conversations.delete(conversationId);
        console.log(`StorageService: Deleted conversation ${conversationId}`);
    }

    /**
     * Get database statistics
     */
    async getStats(): Promise<{
        totalConversations: number;
        totalMessages: number;
        unsyncedConversations: number;
    }> {
        const allConversations = await this.db.conversations.toArray();
        const unsyncedCount = await this.getUnsyncedCount();

        const totalMessages = allConversations.reduce(
            (sum, conv) => sum + conv.messages.length,
            0
        );

        return {
            totalConversations: allConversations.length,
            totalMessages,
            unsyncedConversations: unsyncedCount,
        };
    }
}

// Export singleton instance getter
export const getStorageService = StorageService.getInstance;
