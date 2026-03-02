import { z } from 'zod';

const ExternalMessageSchema = z.object({
    id: z.string().uuid(),
    modelId: z.string(),
    modelName: z.string(),
    userPrompt: z.string().catch(''),
    content: z.string(),
    createdAt: z.number(),
    contextAttached: z.boolean().optional()
});

const StoredConversationSchema = z.object({
    id: z.string(),
    title: z.string().optional(),
    messages: z.array(ExternalMessageSchema),
    anchors: z.record(z.string(), z.any()),
    lastUpdated: z.number(),
    synced: z.boolean().optional()
});

const CloudBackupSchema = z.object({
    version: z.literal(1),
    extensionId: z.literal('gemini-council'),
    lastBackupAt: z.number(),
    conversations: z.array(StoredConversationSchema),
    metadata: z.object({ totalMessages: z.number(), deviceId: z.string().optional() })
});

const data = {
    version: 1,
    extensionId: 'gemini-council',
    lastBackupAt: 123,
    conversations: [
        {
            id: 'c1',
            messages: [
                {
                    id: '550e8400-e29b-41d4-a716-446655440000',
                    modelId: 'm1',
                    modelName: 'M1',
                    content: 'hello',
                    createdAt: 123
                }
            ],
            anchors: {},
            lastUpdated: 123,
            synced: true
        }
    ],
    metadata: { totalMessages: 1 }
};

console.log(CloudBackupSchema.safeParse(data));
