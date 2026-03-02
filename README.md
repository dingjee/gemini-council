# Gemini Council

A Firefox browser extension that enhances Google Gemini with a secondary opinion layer.

## Prerequisites

- [Bun](https://bun.sh/) v1.3.2+
- Firefox 140.0+

## Installation

```bash
bun install
```

## Development

### Build the extension

```bash

# Build for Firefox
bun run build:firefox
```

### Watch Mode (Auto-rebuild on file changes)

```bash

# Watch mode for Firefox (outputs to dist_firefox)
bun run dev:firefox
```

## Firefox Extension

### Load Extension in Firefox

1. Run `bun run build:firefox`
2. Open Firefox and navigate to `about:debugging`
3. Click **"This Firefox"** → **"Load Temporary Add-on..."**
4. Select `dist_firefox/manifest.json`

### Validate Extension

Check the extension for manifest errors and code issues:

```bash
bun run lint:firefox
```

### Package for Distribution

Build and package the extension as a `.xpi` file:

```bash
bun run pack:firefox
```

The packaged extension will be saved to `web-ext-artifacts/`.

## Available Scripts

| Script | Description |
|--------|-------------|
| `bun run build:firefox` | Build extension for Firefox → `dist_firefox/` |
| `bun run dev:firefox` | Watch mode for Firefox with auto-rebuild |
| `bun run lint:firefox` | Validate Firefox extension |
| `bun run pack:firefox` | Package as `.xpi` for distribution |

## Project Structure

```
gemini-council/
├── src/
│   ├── content.ts      # Content script injected into Gemini
│   ├── background.ts   # Background service worker
│   └── core/           # Core services
├── public/
│   └── manifest.json   # Extension manifest
├── dist/               # Built extension - Chrome (generated)
├── dist_firefox/       # Built extension - Firefox (generated)
└── build.ts            # Build script
```

## License

MIT
