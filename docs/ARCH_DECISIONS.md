# Architecture Decisions Log

## 2026-02-09: Local-First + Google Drive Sync Architecture

### Decision
Implemented a dual-layer storage architecture:
- **Local-First**: IndexedDB via Dexie.js for immediate UI responsiveness
- **Cloud Backup**: Google Drive `appDataFolder` for cross-device sync

### Context
Users lose their "shadow conversations" (external model responses injected into Gemini) when:
- Refreshing the page
- Switching devices
- Clearing browser data

### Solution Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Content Script                          │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │  CouncilManager │────▶│  StorageBridge  │                    │
│  └─────────────────┘     └────────┬────────┘                    │
│                                   │ chrome.runtime.sendMessage  │
└───────────────────────────────────┼─────────────────────────────┘
                                    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Background Script                          │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │  SyncManager    │────▶│  StorageService │──▶ IndexedDB       │
│  │  (The Brain)    │     └─────────────────┘                    │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐     ┌─────────────────┐                    │
│  │  DriveClient    │────▶│  AuthService    │──▶ Google OAuth    │
│  │                 │     └─────────────────┘                    │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│     Google Drive API (appDataFolder)                            │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | File | Responsibility |
|-----------|------|----------------|
| StorageService | `src/core/services/StorageService.ts` | Dexie.js wrapper for IndexedDB |
| AuthService | `src/core/services/AuthService.ts` | OAuth token management |
| DriveClient | `src/core/services/DriveClient.ts` | Google Drive API operations |
| SyncManager | `src/core/services/SyncManager.ts` | Sync orchestration & debouncing |
| StorageBridge | `src/features/council/storage/StorageBridge.ts` | Content script API |
| MessageHydrator | `src/features/council/storage/MessageHydrator.ts` | DOM re-injection on refresh |
| SyncIndicator | `src/features/council/ui/SyncIndicator.ts` | Sync status UI & login handler |

### Data Schema

```typescript
interface StoredConversation {
  id: string;              // Gemini conversation ID from URL
  messages: ExternalMessage[];
  anchors: Record<string, MessageAnchor>;
  lastUpdated: number;     // Timestamp for conflict resolution
  synced: boolean;         // Cloud sync status
  title?: string;
}

interface ExternalMessage {
  id: string;              // UUID
  modelId: string;         // e.g., "anthropic/claude-3-opus"
  modelName: string;
  userPrompt: string;
  content: string;
  createdAt: number;
  contextAttached?: boolean;
}
```

### Sync Strategy

1. **Hydration (Startup)**:
   - Pull from Google Drive
   - **Union Merge**: Messages are always merged (append-only), regardless of timestamp
   - **Union Merge**: Anchors are combined
   - **Max Timestamp**: Last updated is `Math.max(local, cloud)`

2. **Runtime Writes**:
   - Write to IndexedDB immediately
   - Mark as `synced: false`
   - Trigger debounced sync

3. **Debouncing**:
   - 30 seconds after last write, OR
   - After 5 messages accumulated
   - Minimum 60 seconds between syncs

### Privacy Considerations

- Uses `drive.appdata` scope (user-invisible app folder)
- Data stored only in extension's private folder
- No pollution of user's visible Drive space
- API keys never logged (per MANDATES)

### Error Handling

| Error | Strategy |
|-------|----------|
| Network offline | Mark `status: "offline"`, retry on reconnect |
| 401 Unauthorized | Refresh token, retry once |
| 429 Rate Limited | Exponential backoff, respect `Retry-After` |
| 403 Forbidden | Prompt for re-authentication |

### Trade-offs

**Option A (Chosen)**: Single backup file `backup_v1.json`
- ✅ Simple to implement
- ✅ Atomic updates
- ✅ Easy conflict resolution
- ⚠️ May hit size limits with heavy use

**Option B (Future)**: Per-conversation sharding
- Requires file listing/management
- More complex conflict resolution
- Better for very large datasets

### Future Enhancements

1. **Compression**: gzip backup before upload for large datasets
2. **Sharding**: Split by conversation if file exceeds 5MB
3. **Realtime Sync**: WebSocket-based sync when Drive supports it
4. **Offline Queue**: Queue sync operations when offline

---

*Last updated: 2026-02-09*
