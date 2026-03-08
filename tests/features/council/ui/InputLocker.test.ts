import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { InputLocker } from '../../../../src/features/council/ui/InputLocker';

describe('InputLocker', () => {
    let locker: InputLocker;
    let inputEl: HTMLElement;
    let sendBtn: HTMLButtonElement;
    let fieldset: HTMLFieldSetElement;

    beforeEach(() => {
        document.body.innerHTML = '';
        document.head.innerHTML = '';
        InputLocker.resetStyles();

        locker = new InputLocker();

        // Build minimal DOM matching Gemini's input area structure
        fieldset = document.createElement('fieldset');
        fieldset.className = 'input-area-container';

        const textField = document.createElement('div');
        textField.className = 'text-input-field';

        inputEl = document.createElement('div');
        inputEl.setAttribute('contenteditable', 'true');
        inputEl.setAttribute('role', 'textbox');
        textField.appendChild(inputEl);

        const leadingActions = document.createElement('div');
        leadingActions.className = 'leading-actions-wrapper';
        fieldset.appendChild(leadingActions);

        fieldset.appendChild(textField);

        const sendContainer = document.createElement('div');
        sendContainer.className = 'send-button-container';

        sendBtn = document.createElement('button');
        sendBtn.className = 'send-button';
        sendBtn.setAttribute('aria-label', 'Send message');

        const sendIcon = document.createElement('mat-icon');
        sendIcon.className = 'send-button-icon icon-filled gds-icon-xl google-symbols';
        sendIcon.setAttribute('fonticon', 'send');
        sendBtn.appendChild(sendIcon);

        sendContainer.appendChild(sendBtn);
        fieldset.appendChild(sendContainer);

        document.body.appendChild(fieldset);
    });

    afterEach(() => {
        document.body.innerHTML = '';
        document.head.innerHTML = '';
    });

    it('should start unlocked', () => {
        expect(locker.isLocked).toBe(false);
    });

    describe('lock()', () => {
        it('should set isLocked to true', () => {
            locker.lock(inputEl, sendBtn);
            expect(locker.isLocked).toBe(true);
        });

        it('should disable contenteditable on input', () => {
            locker.lock(inputEl, sendBtn);
            expect(inputEl.getAttribute('contenteditable')).toBe('false');
        });

        it('should add council-input-locked class to fieldset', () => {
            locker.lock(inputEl, sendBtn);
            expect(fieldset.classList.contains('council-input-locked')).toBe(true);
        });

        it('should add stop and council-stop-mode classes to send button', () => {
            locker.lock(inputEl, sendBtn);
            expect(sendBtn.classList.contains('stop')).toBe(true);
            expect(sendBtn.classList.contains('council-stop-mode')).toBe(true);
        });

        it('should change send button aria-label to "Stop response"', () => {
            locker.lock(inputEl, sendBtn);
            expect(sendBtn.getAttribute('aria-label')).toBe('Stop response');
        });

        it('should store original aria-label', () => {
            locker.lock(inputEl, sendBtn);
            expect(sendBtn.getAttribute('data-original-aria-label')).toBe('Send message');
        });

        it('should hide the send icon', () => {
            locker.lock(inputEl, sendBtn);
            const sendIcon = sendBtn.querySelector('.send-button-icon');
            expect(sendIcon?.classList.contains('hidden')).toBe(true);
        });

        it('should add stop icon indicator element', () => {
            locker.lock(inputEl, sendBtn);
            const stopIcon = sendBtn.querySelector('.council-stop-indicator');
            expect(stopIcon).not.toBeNull();
            expect(stopIcon?.querySelector('svg')).not.toBeNull();
        });

        it('should inject CSS styles on first lock', () => {
            expect(document.getElementById('council-input-lock-styles')).toBeNull();
            locker.lock(inputEl, sendBtn);
            expect(document.getElementById('council-input-lock-styles')).not.toBeNull();
        });

        it('should be idempotent — second lock is a no-op', () => {
            locker.lock(inputEl, sendBtn);
            locker.lock(inputEl, sendBtn);
            const stopIcons = sendBtn.querySelectorAll('.council-stop-indicator');
            expect(stopIcons.length).toBe(1);
        });
    });

    describe('unlock()', () => {
        beforeEach(() => {
            locker.lock(inputEl, sendBtn);
        });

        it('should set isLocked to false', () => {
            locker.unlock(inputEl, sendBtn);
            expect(locker.isLocked).toBe(false);
        });

        it('should restore contenteditable to "true"', () => {
            locker.unlock(inputEl, sendBtn);
            expect(inputEl.getAttribute('contenteditable')).toBe('true');
        });

        it('should remove council-input-locked class from fieldset', () => {
            locker.unlock(inputEl, sendBtn);
            expect(fieldset.classList.contains('council-input-locked')).toBe(false);
        });

        it('should remove stop and council-stop-mode classes', () => {
            locker.unlock(inputEl, sendBtn);
            expect(sendBtn.classList.contains('stop')).toBe(false);
            expect(sendBtn.classList.contains('council-stop-mode')).toBe(false);
        });

        it('should restore original aria-label', () => {
            locker.unlock(inputEl, sendBtn);
            expect(sendBtn.getAttribute('aria-label')).toBe('Send message');
        });

        it('should clean up data-original-aria-label attribute', () => {
            locker.unlock(inputEl, sendBtn);
            expect(sendBtn.hasAttribute('data-original-aria-label')).toBe(false);
        });

        it('should show the send icon again', () => {
            locker.unlock(inputEl, sendBtn);
            const sendIcon = sendBtn.querySelector('.send-button-icon');
            expect(sendIcon?.classList.contains('hidden')).toBe(false);
        });

        it('should remove stop icon element', () => {
            locker.unlock(inputEl, sendBtn);
            expect(sendBtn.querySelector('.council-stop-indicator')).toBeNull();
        });

        it('should be idempotent — second unlock is a no-op', () => {
            locker.unlock(inputEl, sendBtn);
            locker.unlock(inputEl, sendBtn);
            expect(locker.isLocked).toBe(false);
            // send icon should still be visible
            const sendIcon = sendBtn.querySelector('.send-button-icon');
            expect(sendIcon?.classList.contains('hidden')).toBe(false);
        });
    });

    describe('lock/unlock cycle', () => {
        it('should cleanly cycle between locked and unlocked states', () => {
            // Lock → Unlock → Lock → Unlock
            locker.lock(inputEl, sendBtn);
            expect(locker.isLocked).toBe(true);
            expect(inputEl.getAttribute('contenteditable')).toBe('false');

            locker.unlock(inputEl, sendBtn);
            expect(locker.isLocked).toBe(false);
            expect(inputEl.getAttribute('contenteditable')).toBe('true');
            expect(sendBtn.querySelectorAll('.council-stop-indicator').length).toBe(0);

            locker.lock(inputEl, sendBtn);
            expect(locker.isLocked).toBe(true);
            expect(sendBtn.querySelectorAll('.council-stop-indicator').length).toBe(1);

            locker.unlock(inputEl, sendBtn);
            expect(locker.isLocked).toBe(false);
            expect(sendBtn.querySelectorAll('.council-stop-indicator').length).toBe(0);
        });
    });

    describe('reapply()', () => {
        it('should re-apply locked state to newly rendered elements', () => {
            locker.lock(inputEl, sendBtn);

            // Simulate Angular re-rendering the send button
            const newSendBtn = document.createElement('button');
            newSendBtn.className = 'send-button';
            newSendBtn.setAttribute('aria-label', 'Send message');
            const newIcon = document.createElement('mat-icon');
            newIcon.className = 'send-button-icon';
            newSendBtn.appendChild(newIcon);

            locker.reapply(inputEl, newSendBtn);

            expect(newSendBtn.classList.contains('council-stop-mode')).toBe(true);
            expect(newSendBtn.querySelector('.council-stop-indicator')).not.toBeNull();
            expect(newSendBtn.getAttribute('aria-label')).toBe('Stop response');
        });

        it('should re-apply contenteditable=false on input', () => {
            locker.lock(inputEl, sendBtn);
            inputEl.setAttribute('contenteditable', 'true'); // simulate re-render
            locker.reapply(inputEl, sendBtn);
            expect(inputEl.getAttribute('contenteditable')).toBe('false');
        });

        it('should not duplicate stop indicators if already applied', () => {
            locker.lock(inputEl, sendBtn);
            locker.reapply(inputEl, sendBtn); // same button, already has stop indicator
            expect(sendBtn.querySelectorAll('.council-stop-indicator').length).toBe(1);
        });

        it('should be a no-op when not locked', () => {
            locker.reapply(inputEl, sendBtn);
            expect(sendBtn.classList.contains('council-stop-mode')).toBe(false);
            expect(sendBtn.querySelector('.council-stop-indicator')).toBeNull();
        });
    });

    describe('null element handling', () => {
        it('should not throw when locking with null input', () => {
            expect(() => locker.lock(null, sendBtn)).not.toThrow();
            expect(locker.isLocked).toBe(true);
            // Send button should still transform
            expect(sendBtn.classList.contains('council-stop-mode')).toBe(true);
        });

        it('should not throw when locking with null send button', () => {
            expect(() => locker.lock(inputEl, null)).not.toThrow();
            expect(locker.isLocked).toBe(true);
            // Input should still be disabled
            expect(inputEl.getAttribute('contenteditable')).toBe('false');
        });

        it('should not throw when locking with both null', () => {
            expect(() => locker.lock(null, null)).not.toThrow();
            expect(locker.isLocked).toBe(true);
        });

        it('should not throw when unlocking with null elements', () => {
            locker.lock(inputEl, sendBtn);
            expect(() => locker.unlock(null, null)).not.toThrow();
            expect(locker.isLocked).toBe(false);
        });

        it('should not throw when reapplying with null elements', () => {
            locker.lock(inputEl, sendBtn);
            expect(() => locker.reapply(null, null)).not.toThrow();
        });
    });

    describe('fieldset discovery', () => {
        it('should find fieldset via closest() from input element', () => {
            locker.lock(inputEl, sendBtn);
            expect(fieldset.classList.contains('council-input-locked')).toBe(true);
        });

        it('should find fieldset via querySelector when input has no parent fieldset', () => {
            // Remove input from fieldset and put it elsewhere
            const orphanInput = document.createElement('div');
            orphanInput.setAttribute('contenteditable', 'true');
            document.body.appendChild(orphanInput);

            locker.lock(orphanInput, sendBtn);
            // Should still find the fieldset via querySelector fallback
            expect(fieldset.classList.contains('council-input-locked')).toBe(true);
        });
    });

    describe('alternative send icon selectors', () => {
        it('should find send icon via fonticon attribute', () => {
            // Replace with fonticon-only icon
            sendBtn.innerHTML = '';
            const icon = document.createElement('mat-icon');
            icon.setAttribute('fonticon', 'send');
            sendBtn.appendChild(icon);

            locker.lock(inputEl, sendBtn);
            expect(icon.classList.contains('hidden')).toBe(true);

            locker.unlock(inputEl, sendBtn);
            expect(icon.classList.contains('hidden')).toBe(false);
        });

        it('should find send icon via data-mat-icon-name attribute', () => {
            sendBtn.innerHTML = '';
            const icon = document.createElement('mat-icon');
            icon.setAttribute('data-mat-icon-name', 'send');
            sendBtn.appendChild(icon);

            locker.lock(inputEl, sendBtn);
            expect(icon.classList.contains('hidden')).toBe(true);
        });
    });

    describe('resetStyles()', () => {
        it('should remove injected style element', () => {
            locker.lock(inputEl, sendBtn);
            expect(document.getElementById('council-input-lock-styles')).not.toBeNull();

            InputLocker.resetStyles();
            expect(document.getElementById('council-input-lock-styles')).toBeNull();
        });

        it('should allow styles to be re-injected on next lock', () => {
            locker.lock(inputEl, sendBtn);
            locker.unlock(inputEl, sendBtn);
            InputLocker.resetStyles();

            const freshLocker = new InputLocker();
            freshLocker.lock(inputEl, sendBtn);
            expect(document.getElementById('council-input-lock-styles')).not.toBeNull();
        });
    });
});
