# GEMINI_COUNCIL (v2.0) - AI Dev Protocol

## 1. MANDATES
* **Privacy**: API Keys in `browser.storage.local` ONLY. PDFs processed CLIENT-SIDE (Text Extract) only; never upload binary.
* **TDD**: Strict Red-Green-Refactor. No implementation without a failing test.
* **Legacy**: Respect `gemini-voyager` core. Extend via composition; avoid modifying `DOMService`.
* **Typing**: No `any`. Use `zod` for API, `unknown`+narrowing for DOM.
* **Docs**: Log decisions in `docs/ARCH_DECISIONS.md`.

## 2. WORKFLOW (The Loop)
**P1: DESIGN (No Code)**
1. **Scan**: Analyze existing parsers (`src/features/export`).
2. **Plan**: Define Interface (`IOpenRouterBridge`), Data Flow (`DOM->Interceptor->BG->UI`), Tools (`pdf.js`).
3. **Trade-off**: Option A vs B.

**P2: TDD CYCLE**
1. **🔴 RED**: Create test (`tests/features/council/`). Mock Chrome/Net. Confirm logical failure.
2. **🟢 GREEN**: Min code to pass. No optimization.
3. **🔵 REFACTOR**: DRY, Type Strictness. Regression check legacy features.

**P3: VERIFY**
* Check: No `console.log` with tokens. `bun run build` passes.

## 3. PROTOCOLS
* **R-W-V**: Read target -> Write atomic -> Verify content.
* **Network**: `background.js` is SOLE exit for OpenRouter API. Content scripts must use `sendMessage`.
* **Selectors**: Use `aria-label`, `role`, or generic structural path. NEVER `jsname` or unstable classes.
* **Blocking**: Heavy parsing (PDF) in WebWorkers/IdleCallback only.

## 4. ARCHITECTURE
* **Patterns**: Dependency Injection (Services), EventBus (Content<->BG), SoC (UI != API).
* **Anti-Patterns**: Hardcoded models (fetch from API), Prompt Leakage in logs, `any` type.
* **Sync**: GitHub Gist based (Personal Access Token).

## 5. TESTING (Vitest/jsdom)
* **Mocks**: Stub `global.fetch` (NEVER real net). Mock `chrome.runtime`, `chrome.storage`.
* **Scope**: Unit test logic; Integration test flows.

## 6. STRUCTURE MAP
* `src/core/services/OpenRouterService.ts`: API Bridge (Format/Fetch).
* `src/features/council/core`: Coordinator.
* `src/features/council/ui`: Sidecar Component (Split-View).
* `src/core/types/storage.types.ts`: Storage schemas (Zod).
* `src/core/services/SyncManager.ts`: Sync Orchestration.
* `src/core/services/GistClient.ts`: GitHub Gist Sync Client.
* `src/features/council/storage`: Local persistence & Hydration.
* `src/features/council/parsers`: PDF/Text Extractors.
* `src/pages/content/council-injector.ts`: Bootstrapper.
