/**
 * SyncIndicator - UI Component for Sync Status
 * 
 * Displays a button indicating GitHub Gist sync status.
 * Handles login/logout and manual sync triggers.
 */

import { StorageBridge } from "../storage/StorageBridge";
import type { SyncState, SyncStatus } from "../../../core/types/storage.types";

// ============================================================================
// SyncIndicator Class
// ============================================================================

export class SyncIndicator {
    private element: HTMLElement;
    private status: SyncStatus = "idle";
    private isLoggedIn = false;
    private pendingChanges = 0;
    private lastError: string | null = null;
    private poller: number | undefined;

    constructor() {
        this.element = document.createElement("button");
        this.element.className = "council-sync-btn";
        this.element.title = "GitHub Gist Sync";

        this.element.onclick = (e) => {
            e.stopPropagation();
            this.handleClick();
        };

        this.updateUI();
        this.startPolling();
    }

    /**
     * Get the DOM element for the indicator
     */
    public getElement(): HTMLElement {
        return this.element;
    }

    /**
     * Clean up resources
     */
    public destroy() {
        if (this.poller) {
            clearInterval(this.poller);
        }
        this.element.remove();
    }

    /**
     * Start polling for sync status
     */
    private startPolling() {
        // Initial check
        this.checkStatus();

        // Poll every 5 seconds
        this.poller = window.setInterval(() => {
            this.checkStatus();
        }, 5000);
    }

    /**
     * Check sync status via bridge
     */
    private async checkStatus() {
        try {
            const result = await StorageBridge.getSyncStatus();

            if (result.success && result.state) {
                this.status = result.state.status;
                this.isLoggedIn = result.isLoggedIn || false;
                this.pendingChanges = result.state.pendingChanges;
                this.lastError = result.state.error || null;
                this.updateUI();
            }
        } catch (error) {
            // Silently fail - status will be retried on next poll
        }
    }

    /**
     * Handle button click
     */
    private async handleClick() {
        if (!this.isLoggedIn) {
            // Trigger login via prompt for PAT
            // @ts-ignore
            const defaultToken = process.env.GITHUB_GIST_API_KEY || "";
            const token = window.prompt("Enter GitHub Personal Access Token (with 'gist' scope):", defaultToken);
            if (!token) return;

            this.setLoading(true);
            const result = await StorageBridge.login(token);
            this.setLoading(false);

            if (result.success) {
                this.checkStatus();
                this.showToast("Connected to GitHub Gist");
            } else {
                this.showToast("Login failed: " + (result.error || "Unknown error"));
            }
        } else {
            // Trigger manual sync
            this.status = "syncing";
            this.updateUI();

            const result = await StorageBridge.syncNow();
            if (result.success) {
                this.showToast("Sync complete");
                this.lastError = null;
            } else {
                const errorMsg = result.error || (result.state?.error) || "Unknown error";
                this.lastError = errorMsg;
                this.showToast(`Sync failed: ${errorMsg}`);
                console.error("Gemini Council Sync Failed:", errorMsg);
            }
            this.checkStatus();
        }
    }

    /**
     * Update the UI based on current state
     */
    private updateUI() {
        // Icons
        const ICON_CLOUD_OFF = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"></line><path d="M22.61 16.95A5 5 0 0 0 18 10h-1.26a8 8 0 0 0-7.05-6M5 5a8 8 0 0 0 4 7h2a5 5 0 0 0 5.95 2.5"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>`;
        const ICON_CLOUD = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"></path></svg>`;
        const ICON_SYNC = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>`;
        const ICON_CHECK = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`;
        const ICON_ALERT = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;

        let icon = ICON_CLOUD;
        let tooltip = "GitHub Gist Sync";
        let classes = "council-sync-btn";

        if (!this.isLoggedIn) {
            icon = ICON_CLOUD_OFF;
            tooltip = "Connect to GitHub Gist";
            classes += " disconnected";
        } else if (this.status === "syncing") {
            icon = ICON_SYNC;
            tooltip = "Syncing...";
            classes += " syncing";
        } else if (this.status === "error") {
            icon = ICON_ALERT;
            const errorTooltip = this.lastError ? `: ${this.lastError}` : "";
            tooltip = `Sync Error${errorTooltip} (Click to retry)`;
            classes += " error";

            if (this.lastError) {
                console.warn("Gemini Council Sync Error State:", this.lastError);
            }
        } else if (this.pendingChanges > 0) {
            icon = ICON_CLOUD; // or a specific icon for pending
            tooltip = `${this.pendingChanges} changes pending`;
            classes += " pending";
        } else {
            icon = ICON_CHECK;
            tooltip = "Synced";
            classes += " synced";
        }

        this.element.innerHTML = icon;
        this.element.title = tooltip;
        this.element.className = classes;
    }

    private setLoading(loading: boolean) {
        if (loading) {
            this.element.innerHTML = `<svg class="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>`;
            this.element.classList.add("loading");
        } else {
            this.updateUI();
            this.element.classList.remove("loading");
        }
    }

    private showToast(message: string) {
        // Simple toast implementation
        const toast = document.createElement("div");
        toast.className = "council-toast";
        toast.innerText = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add("visible"), 10);
        setTimeout(() => {
            toast.classList.remove("visible");
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}
