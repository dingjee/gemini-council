import { cp, rm } from "fs/promises";

// Parse command line arguments
const args = process.argv.slice(2);
const isFirefox = args.includes("--firefox");
const isChrome = args.includes("--chrome");
const outDir = isFirefox ? "./dist_firefox" : (isChrome ? "./dist_chrome" : "./dist");

console.log(`Building Gemini Council for ${isFirefox ? "Firefox" : "Chrome"}...`);

// Clean output directory
await rm(outDir, { recursive: true, force: true });

// Build content script and background script
await Bun.build({
    entrypoints: ["./src/content.ts", "./src/background.ts"],
    outdir: outDir,
    target: "browser",
    define: {
        "process.env.OPENROUTER_API_KEY": JSON.stringify(Bun.env.OPENROUTER_API_KEY || ""),
        "process.env.GITHUB_GIST_API_KEY": JSON.stringify(Bun.env.GITHUB_GIST_API_KEY || ""),
    },
    minify: false, // Keep it readable for now
});

if (Bun.env.OPENROUTER_API_KEY) {
    console.log("Injecting OpenRouter API Key from .env (Length: " + Bun.env.OPENROUTER_API_KEY.length + ")");
} else {
    console.warn("WARNING: No OPENROUTER_API_KEY found in environment!");
}

if (Bun.env.GITHUB_GIST_API_KEY) {
    console.log("Injecting GitHub Gist API Key from .env (Length: " + Bun.env.GITHUB_GIST_API_KEY.length + ")");
} else {
    console.warn("WARNING: No GITHUB_GIST_API_KEY found in environment!");
}

// Copy static assets
await cp("./public", outDir, { recursive: true });

// Browser-specific manifest adjustments
const manifestPath = `${outDir}/manifest.json`;
const manifestStr = await Bun.file(manifestPath).text();
const manifest = JSON.parse(manifestStr);

if (!isFirefox) {
    // Chrome/Agent specific manifest adjustments
    if (manifest.background && manifest.background.scripts) {
        manifest.background.service_worker = manifest.background.scripts[0];
        delete manifest.background.scripts;
    }

    if (manifest.browser_specific_settings) {
        delete manifest.browser_specific_settings;
    }

    await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));
}

console.log(`Build complete! Load '${outDir}' in ${isFirefox ? "Firefox about:debugging" : "Chrome extension page or agent testing"}.`);
