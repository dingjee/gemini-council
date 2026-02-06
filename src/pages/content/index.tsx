/**
 * Gemini Council - Content Script Entry Point
 * Minimal version: Export + FormulaCopy only
 */
import { startFormulaCopy } from '@/features/formulaCopy';
import { startExportButton } from './export/index';

let initialized = false;

/**
 * Initialize core features
 */
async function initializeFeatures(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    console.log('[Gemini Council] Initializing...');

    // Start Formula Copy feature
    startFormulaCopy();

    // Start Export Button feature
    startExportButton();

    console.log('[Gemini Council] Initialization complete');
  } catch (e) {
    console.error('[Gemini Council] Initialization error:', e);
  }
}

// Main initialization
(function () {
  try {
    const hostname = location.hostname.toLowerCase();
    const isSupportedSite =
      hostname.includes('gemini.google.com') ||
      hostname.includes('aistudio.google.com') ||
      hostname.includes('aistudio.google.cn');

    if (isSupportedSite) {
      initializeFeatures();
    } else {
      console.log('[Gemini Council] Not a supported website, skipping initialization');
    }
  } catch (e) {
    console.error('[Gemini Council] Fatal initialization error:', e);
  }
})();
