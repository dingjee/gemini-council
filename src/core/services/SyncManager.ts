/**
 * SyncManager - The Brain of the Sync System
 * 
 * Orchestrates all sync operations between local IndexedDB and GitHub Gist.
 * Implements debounced writes, hydration on startup, and conflict resolution.
 */

import { StorageService } from "./StorageService";
import { GistClient, type GistResult } from "./GistClient";
import {
    type CloudBackup,
    type SyncState,
    type StoredConversation,
    createEmptyBackup,
} from "../types/storage.types";

// ============================================================================
// Constants
// ============================================================================

// Debounce settings
const SYNC_DEBOUNCE_MS = 30 * 1000; // 30 seconds after last write
const SYNC_MESSAGE_THRESHOLD = 5; // Trigger sync after 5 messages
const MIN_SYNC_INTERVAL_MS = 60 * 1000; // Minimum 1 minute between syncs

// Retry settings
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 5000;

// Storage key for sync state
const SYNC_STATE_KEY = "council_sync_state";

// ============================================================================
// Types
// ============================================================================

interface PendingChange {
    conversationId: string;
    timestamp: number;
}

// ============================================================================
// SyncManager Class
// ============================================================================

export class SyncManager {
    private storageService: StorageService;
    private gistClient: GistClient;

    private syncState: SyncState = {
        status: "idle",
        lastSyncAt: null,
        pendingChanges: 0,
        error: null,
    };

    // Debounce state
    private pendingChanges: PendingChange[] = [];
    private syncTimer: ReturnType<typeof setTimeout> | null = null;
    private isSyncing = false;

    private static instance: SyncManager | null = null;

    private constructor() {
        this.storageService = StorageService.getInstance();
        this.gistClient = GistClient.getInstance();
    }

    /**
     * Singleton accessor
     */
    static getInstance(): SyncManager {
        if (!SyncManager.instance) {
            SyncManager.instance = new SyncManager();
        }
        return SyncManager.instance;
    }

    // ========================================================================
    // Lifecycle
    // ========================================================================

    /**
     * Initialize the sync manager
     * This should be called when the extension starts
     */
    async init(): Promise<void> {
        console.log("SyncManager: Initializing...");

        // Initialize storage
        await this.storageService.init();

        // Load persisted sync state
        await this.loadSyncState();

        // Initialize gist client (which loads token)
        await this.gistClient.init();

        // Perform initial hydration from cloud
        await this.hydrate();

        console.log("SyncManager: Initialization complete");
    }

    /**
     * Hydrate local storage from cloud on startup
     */
    async hydrate(): Promise<void> {
        console.log("SyncManager: Starting hydration...");

        const isAuth = this.gistClient.isAuthenticated();
        if (!isAuth) {
            console.log("SyncManager: Not authenticated (No GitHub Token), skipping hydration");
            return;
        }

        this.updateState({ status: "syncing" });

        try {
            // Pull cloud backup
            const pullResult = await this.gistClient.pull();

            if (!pullResult.success) {
                console.warn("SyncManager: Hydration pull failed", pullResult.error);
                this.updateState({
                    status: "error",
                    error: pullResult.error.message
                });
                return;
            }

            // Merge cloud data into local
            const mergeResult = await this.storageService.mergeFromCloud(
                pullResult.data.conversations
            );

            console.log("SyncManager: Hydration complete", mergeResult);

            // Check if we have local changes that need to be pushed
            const unsyncedCount = await this.storageService.getUnsyncedCount();
            if (unsyncedCount > 0) {
                console.log(`SyncManager: ${unsyncedCount} local changes need sync`);
                // Schedule a push after hydration
                this.scheduleSync();
            }

            this.updateState({
                status: "idle",
                lastSyncAt: Date.now(),
                error: null,
            });
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            console.error("SyncManager: Hydration error", message);
            this.updateState({ status: "error", error: message });
        }
    }

    // ========================================================================
    // Public API
    // ========================================================================

    /**
     * Record a local change that needs to be synced
     * This is called after every local write
     */
    recordChange(conversationId: string): void {
        this.pendingChanges.push({
            conversationId,
            timestamp: Date.now(),
        });

        this.updateState({
            pendingChanges: this.pendingChanges.length,
        });

        this.scheduleSync();
    }

    /**
     * Force an immediate sync (e.g., before page unload)
     */
    async forceSync(): Promise<boolean> {
        if (this.isSyncing) {
            console.log("SyncManager: Sync already in progress");
            return false;
        }

        // Clear any pending timer
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
            this.syncTimer = null;
        }

        return this.executeSync();
    }

    /**
     * Get current sync state
     */
    getState(): SyncState {
        return { ...this.syncState };
    }

    /**
     * Trigger login flow
     */
    /**
     * Trigger login flow (Set Token)
     */
    async login(token: string): Promise<GistResult<boolean>> {
        const result = await this.gistClient.login(token);
        if (result.success) {
            // After successful login, hydrate
            await this.hydrate();
        }
        return result;
    }

    /**
     * Logout and stop syncing
     */
    async logout(): Promise<void> {
        await this.gistClient.logout();
        this.pendingChanges = [];
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
            this.syncTimer = null;
        }
        this.updateState({
            status: "idle",
            lastSyncAt: null,
            pendingChanges: 0,
        });
    }

    /**
     * Check if user is logged in
     */
    async isLoggedIn(): Promise<boolean> {
        return this.gistClient.isAuthenticated();
    }

    // ========================================================================
    // Sync Logic
    // ========================================================================

    /**
     * Schedule a sync with debouncing
     */
    private scheduleSync(): void {
        // Check if we should sync based on message threshold
        const shouldSyncNow = this.pendingChanges.length >= SYNC_MESSAGE_THRESHOLD;

        // Check minimum interval
        const timeSinceLastSync = this.syncState.lastSyncAt
            ? Date.now() - this.syncState.lastSyncAt
            : Infinity;
        const canSyncNow = timeSinceLastSync >= MIN_SYNC_INTERVAL_MS;

        if (shouldSyncNow && canSyncNow) {
            // Threshold reached and interval passed - sync now
            this.executeSync();
            return;
        }

        // Clear existing timer
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
        }

        // Schedule debounced sync
        this.syncTimer = setTimeout(() => {
            this.executeSync();
        }, SYNC_DEBOUNCE_MS);

        console.log(`SyncManager: Sync scheduled in ${SYNC_DEBOUNCE_MS / 1000}s`);
    }

    /**
     * Execute the actual sync operation
     */
    private async executeSync(): Promise<boolean> {
        if (this.isSyncing) {
            console.log("SyncManager: Already syncing, skipping");
            return false;
        }

        const isAuth = this.gistClient.isAuthenticated();
        if (!isAuth) {
            console.log("SyncManager: Not authenticated, skipping sync");
            return false;
        }

        this.isSyncing = true;
        this.updateState({ status: "syncing" });

        console.log("SyncManager: Starting sync...");

        let attempt = 0;
        let success = false;

        while (attempt < MAX_RETRY_ATTEMPTS && !success) {
            attempt++;

            try {
                success = await this.performSyncCycle();

                if (success) {
                    // Clear pending changes
                    this.pendingChanges = [];
                    this.updateState({
                        status: "idle",
                        lastSyncAt: Date.now(),
                        pendingChanges: 0,
                        error: null,
                    });
                    console.log("SyncManager: Sync completed successfully");
                }
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : String(error);
                console.error(`SyncManager: Sync attempt ${attempt} failed:`, message);

                if (attempt < MAX_RETRY_ATTEMPTS) {
                    // Wait before retry with exponential backoff
                    await this.sleep(RETRY_BACKOFF_MS * attempt);
                } else {
                    this.updateState({
                        status: "error",
                        error: message,
                    });
                }
            }
        }

        this.isSyncing = false;
        return success;
    }

    /**
     * Perform a full sync cycle (pull, merge, push)
     */
    private async performSyncCycle(): Promise<boolean> {
        // Step 1: Pull latest from cloud
        const pullResult = await this.gistClient.pull();

        if (!pullResult.success) {
            if (pullResult.error.code === "RATE_LIMITED") {
                console.log(`SyncManager: Rate limited`);
                throw new Error("Rate limited");
            }
            if (pullResult.error.code === "NETWORK") {
                this.updateState({ status: "offline" });
                throw new Error("Network unavailable");
            }
            throw new Error(pullResult.error.message);
        }

        // Step 2: Merge cloud into local (handles conflicts)
        await this.storageService.mergeFromCloud(pullResult.data.conversations);

        // Step 3: Export all local data
        const localData = await this.storageService.exportAll();

        // Step 4: Build new backup
        const newBackup: CloudBackup = {
            version: 1,
            extensionId: "gemini-council",
            lastBackupAt: Date.now(),
            conversations: localData,
            metadata: {
                totalMessages: localData.reduce(
                    (sum, conv) => sum + conv.messages.length,
                    0
                ),
            },
        };

        // Step 5: Push to cloud
        const pushResult = await this.gistClient.push(newBackup);

        if (!pushResult.success) {
            if (pushResult.error.code === "RATE_LIMITED") {
                throw new Error("GitHub Rate limit exceeded");
            }
            throw new Error(pushResult.error.message);
        }

        // Step 6: Mark all conversations as synced
        const conversationIds = localData.map(conv => conv.id);
        await this.storageService.markSynced(conversationIds);

        return true;
    }

    // ========================================================================
    // State Management
    // ========================================================================

    private updateState(partial: Partial<SyncState>): void {
        this.syncState = { ...this.syncState, ...partial };
        this.persistSyncState();
    }

    private async loadSyncState(): Promise<void> {
        try {
            const stored = await chrome.storage.local.get(SYNC_STATE_KEY);
            if (stored[SYNC_STATE_KEY]) {
                const state = stored[SYNC_STATE_KEY] as Partial<SyncState>;
                this.syncState = {
                    status: "idle",
                    lastSyncAt: state.lastSyncAt ?? null,
                    pendingChanges: 0,
                    error: null,
                };
            }
        } catch (e) {
            console.warn("SyncManager: Failed to load sync state", e);
        }
    }

    private async persistSyncState(): Promise<void> {
        try {
            await chrome.storage.local.set({
                [SYNC_STATE_KEY]: {
                    lastSyncAt: this.syncState.lastSyncAt,
                },
            });
        } catch (e) {
            console.warn("SyncManager: Failed to persist sync state", e);
        }
    }

    // ========================================================================
    // Helpers
    // ========================================================================

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Export singleton instance getter
export const getSyncManager = SyncManager.getInstance;
