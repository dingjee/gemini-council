# Architecture Decisions Log

## ADR-0001: Council of Models Architecture
* **Status**: Accepted
* **Date**: 2026-02-05
* **Context**: We are building a "Split-Brain" interface to allow a second LLM (Council) to critique Gemini.
* **Decision**: 
  1. **UI Injection**: Inject a split-view `div` directly into the Gemini DOM instead of using the browser Side Panel API. This ensures cross-browser compatibility (Firefox) and better integration with Gemini's layout.
  2. **PDF Parsing**: Use `pdf.js` bundled locally and executed in a Web Worker (or main thread if worker complex, currently planned for client-side). We will NOT upload binaries to the external API; only extracted text.
  3. **Data Flow**: `Content Script` -> `Background (OpenRouter Service)` -> `Content Script`. The Background script handles all API keys and external requests to prevent CORS issues and secure keys.
  4. **State Management**: Use `browser.storage.local` for API keys and preferences. `sessionStorage` or in-memory for PDF context to avoid long-term storage of sensitive document data.
  5. **Type Safety**: strict `zod` schemas for API interactions.
