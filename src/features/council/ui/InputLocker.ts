/**
 * InputLocker - Manages the input field's locked/unlocked state
 * during external model queries.
 *
 * When locked:
 * - Input textarea is set to contenteditable="false"
 * - Input area is grayed out (opacity + pointer-events disabled)
 * - Send button transforms into a Stop button (mimicking Gemini's native stop UI)
 *
 * When unlocked:
 * - Everything is restored to normal
 */
export class InputLocker {
    private _isLocked = false;
    private stopIconElement: HTMLElement | null = null;
    private static styleInjected = false;

    get isLocked(): boolean {
        return this._isLocked;
    }

    /**
     * Lock the input area and transform send → stop.
     */
    lock(inputEl: HTMLElement | null, sendBtn: HTMLElement | null): void {
        if (this._isLocked) return;
        this._isLocked = true;
        InputLocker.injectStyles();

        // 1. Disable input
        if (inputEl) {
            inputEl.setAttribute('contenteditable', 'false');
        }

        // 2. Gray out input area (text field + leading actions only, not trailing/send)
        const fieldset = inputEl?.closest('fieldset.input-area-container')
            || document.querySelector('fieldset.input-area-container');
        if (fieldset) {
            fieldset.classList.add('council-input-locked');
        }

        // 3. Transform send button → stop button
        this.showStopButton(sendBtn);
    }

    /**
     * Unlock the input area and restore send button.
     */
    unlock(inputEl: HTMLElement | null, sendBtn: HTMLElement | null): void {
        if (!this._isLocked) return;
        this._isLocked = false;

        // 1. Re-enable input
        if (inputEl) {
            inputEl.setAttribute('contenteditable', 'true');
        }

        // 2. Remove gray out
        const fieldset = inputEl?.closest('fieldset.input-area-container')
            || document.querySelector('fieldset.input-area-container');
        if (fieldset) {
            fieldset.classList.remove('council-input-locked');
        }

        // 3. Restore send button
        this.hideStopButton(sendBtn);
    }

    /**
     * Re-apply locked state to new/re-rendered elements.
     * Call when MutationObserver detects element re-creation while locked.
     */
    reapply(inputEl: HTMLElement | null, sendBtn: HTMLElement | null): void {
        if (!this._isLocked) return;

        if (inputEl) {
            inputEl.setAttribute('contenteditable', 'false');
        }

        const fieldset = inputEl?.closest('fieldset.input-area-container')
            || document.querySelector('fieldset.input-area-container');
        if (fieldset) {
            fieldset.classList.add('council-input-locked');
        }

        // Only re-apply stop button if not already applied
        if (sendBtn && !sendBtn.classList.contains('council-stop-mode')) {
            this.showStopButton(sendBtn);
        }
    }

    private showStopButton(sendBtn: HTMLElement | null): void {
        if (!sendBtn) return;

        // Mimic Gemini's native stop button behavior
        sendBtn.classList.add('stop', 'council-stop-mode');
        sendBtn.setAttribute('data-original-aria-label', sendBtn.getAttribute('aria-label') || 'Send message');
        sendBtn.setAttribute('aria-label', 'Stop response');

        // Hide the native send icon
        const sendIcon = sendBtn.querySelector(
            '.send-button-icon, mat-icon[fonticon="send"], mat-icon[data-mat-icon-name="send"]'
        );
        if (sendIcon) {
            (sendIcon as HTMLElement).classList.add('hidden');
        }

        // Create stop icon using SVG (works without Angular/Material fonts)
        this.stopIconElement = document.createElement('div');
        this.stopIconElement.className = 'blue-circle stop-icon council-stop-indicator';
        this.stopIconElement.innerHTML =
            '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">' +
            '<rect x="7" y="7" width="10" height="10" rx="1.5"/>' +
            '</svg>';
        sendBtn.appendChild(this.stopIconElement);
    }

    private hideStopButton(sendBtn: HTMLElement | null): void {
        if (!sendBtn) return;

        sendBtn.classList.remove('stop', 'council-stop-mode');
        const originalLabel = sendBtn.getAttribute('data-original-aria-label') || 'Send message';
        sendBtn.setAttribute('aria-label', originalLabel);
        sendBtn.removeAttribute('data-original-aria-label');

        // Show send icon again
        const sendIcon = sendBtn.querySelector(
            '.send-button-icon, mat-icon[fonticon="send"], mat-icon[data-mat-icon-name="send"]'
        );
        if (sendIcon) {
            (sendIcon as HTMLElement).classList.remove('hidden');
        }

        // Remove stop icon
        if (this.stopIconElement) {
            this.stopIconElement.remove();
            this.stopIconElement = null;
        }

        // Clean up any orphaned stop indicators
        sendBtn.querySelectorAll('.council-stop-indicator').forEach(el => el.remove());
    }

    private static injectStyles(): void {
        if (this.styleInjected) return;

        const style = document.createElement('style');
        style.id = 'council-input-lock-styles';
        style.textContent = `
            /* Input Lock - Pending State */
            fieldset.input-area-container.council-input-locked .text-input-field {
                opacity: 0.5;
                pointer-events: none;
                user-select: none;
            }
            fieldset.input-area-container.council-input-locked .leading-actions-wrapper {
                opacity: 0.5;
                pointer-events: none;
            }

            /* Stop button indicator */
            .council-stop-indicator {
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .council-stop-indicator svg {
                color: var(--gem-sys-color--on-surface, #e3e3e3);
            }
        `;
        document.head.appendChild(style);
        this.styleInjected = true;
    }

    /** Reset style injection flag (for testing) */
    static resetStyles(): void {
        this.styleInjected = false;
        document.getElementById('council-input-lock-styles')?.remove();
    }
}
