import { cp, rm } from "fs/promises";

// Parse command line arguments
const args = process.argv.slice(2);
const isFirefox = args.includes("--firefox");
const outDir = isFirefox ? "./dist_firefox" : "./dist";

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

console.log(`Build complete! Load '${outDir}' in ${isFirefox ? "Firefox about:debugging" : "browser"}.`);
