/**
 * Tests for Storage Types and Helper Functions
 */

import { describe, it, expect } from "vitest";
import {
    createExternalMessage,
    createStoredConversation,
    createEmptyBackup,
    hashMessageContent,
    ExternalMessageSchema,
    StoredConversationSchema,
    CloudBackupSchema,
} from "../../../../src/core/types/storage.types";

describe("Storage Types", () => {
    describe("createExternalMessage", () => {
        it("should create a valid ExternalMessage with required fields", () => {
            const message = createExternalMessage({
                modelId: "anthropic/claude-3-opus",
                modelName: "Claude 3 Opus",
                userPrompt: "Hello, world!",
                content: "Hello! How can I help you today?",
            });

            expect(message.id).toBeDefined();
            expect(message.id.length).toBeGreaterThan(0);
            expect(message.modelId).toBe("anthropic/claude-3-opus");
            expect(message.modelName).toBe("Claude 3 Opus");
            expect(message.userPrompt).toBe("Hello, world!");
            expect(message.content).toBe("Hello! How can I help you today?");
            expect(message.createdAt).toBeDefined();
            expect(message.createdAt).toBeLessThanOrEqual(Date.now());
            expect(message.contextAttached).toBe(false);

            // Validate against schema
            const result = ExternalMessageSchema.safeParse(message);
            expect(result.success).toBe(true);
        });

        it("should respect optional contextAttached parameter", () => {
            const message = createExternalMessage({
                modelId: "openai/gpt-4",
                modelName: "GPT-4",
                userPrompt: "Test",
                content: "Response",
                contextAttached: true,
            });

            expect(message.contextAttached).toBe(true);
        });

        it("should generate unique IDs for each message", () => {
            const message1 = createExternalMessage({
                modelId: "test",
                modelName: "Test",
                userPrompt: "Test",
                content: "Response",
            });

            const message2 = createExternalMessage({
                modelId: "test",
                modelName: "Test",
                userPrompt: "Test",
                content: "Response",
            });

            expect(message1.id).not.toBe(message2.id);
        });
    });

    describe("createStoredConversation", () => {
        it("should create a valid StoredConversation", () => {
            const conversation = createStoredConversation("conv-123", "My Conversation");

            expect(conversation.id).toBe("conv-123");
            expect(conversation.title).toBe("My Conversation");
            expect(conversation.messages).toEqual([]);
            expect(conversation.anchors).toEqual({});
            expect(conversation.lastUpdated).toBeDefined();
            expect(conversation.synced).toBe(false);

            // Validate against schema
            const result = StoredConversationSchema.safeParse(conversation);
            expect(result.success).toBe(true);
        });

        it("should work without optional title", () => {
            const conversation = createStoredConversation("conv-456");

            expect(conversation.id).toBe("conv-456");
            expect(conversation.title).toBeUndefined();
        });
    });

    describe("createEmptyBackup", () => {
        it("should create a valid empty CloudBackup", () => {
            const backup = createEmptyBackup();

            expect(backup.version).toBe(1);
            expect(backup.extensionId).toBe("gemini-council");
            expect(backup.lastBackupAt).toBeDefined();
            expect(backup.conversations).toEqual([]);
            expect(backup.metadata.totalMessages).toBe(0);

            // Validate against schema
            const result = CloudBackupSchema.safeParse(backup);
            expect(result.success).toBe(true);
        });
    });

    describe("hashMessageContent", () => {
        it("should produce consistent hashes for same content", () => {
            const content = "This is a test message";
            const hash1 = hashMessageContent(content);
            const hash2 = hashMessageContent(content);

            expect(hash1).toBe(hash2);
        });

        it("should produce different hashes for different content", () => {
            const hash1 = hashMessageContent("Message A");
            const hash2 = hashMessageContent("Message B");

            expect(hash1).not.toBe(hash2);
        });

        it("should handle empty strings", () => {
            const hash = hashMessageContent("");

            expect(hash).toBeDefined();
            expect(hash.length).toBeGreaterThan(0);
        });

        it("should handle long content", () => {
            const longContent = "x".repeat(100000);
            const hash = hashMessageContent(longContent);

            expect(hash).toBeDefined();
            expect(hash.length).toBeGreaterThan(0);
        });
    });
});

describe("Schema Validation", () => {
    describe("ExternalMessageSchema", () => {
        it("should reject invalid UUID", () => {
            const invalid = {
                id: "not-a-uuid",
                modelId: "test",
                modelName: "Test",
                userPrompt: "Test",
                content: "Response",
                createdAt: Date.now(),
            };

            const result = ExternalMessageSchema.safeParse(invalid);
            expect(result.success).toBe(false);
        });

        it("should reject missing required fields", () => {
            const invalid = {
                id: crypto.randomUUID(),
                modelId: "test",
                // missing modelName, userPrompt, content, createdAt
            };

            const result = ExternalMessageSchema.safeParse(invalid);
            expect(result.success).toBe(false);
        });
    });

    describe("StoredConversationSchema", () => {
        it("should accept valid conversation with messages", () => {
            const conversation = {
                id: "conv-123",
                messages: [
                    {
                        id: crypto.randomUUID(),
                        modelId: "test",
                        modelName: "Test",
                        userPrompt: "Hello",
                        content: "Hi there",
                        createdAt: Date.now(),
                    },
                ],
                anchors: {},
                lastUpdated: Date.now(),
                synced: true,
            };

            const result = StoredConversationSchema.safeParse(conversation);
            expect(result.success).toBe(true);
        });
    });

    describe("CloudBackupSchema", () => {
        it("should reject wrong version", () => {
            const invalid = {
                version: 2, // Wrong version
                extensionId: "gemini-council",
                lastBackupAt: Date.now(),
                conversations: [],
                metadata: { totalMessages: 0 },
            };

            const result = CloudBackupSchema.safeParse(invalid);
            expect(result.success).toBe(false);
        });

        it("should reject wrong extensionId", () => {
            const invalid = {
                version: 1,
                extensionId: "wrong-extension",
                lastBackupAt: Date.now(),
                conversations: [],
                metadata: { totalMessages: 0 },
            };

            const result = CloudBackupSchema.safeParse(invalid);
            expect(result.success).toBe(false);
        });
    });
});
